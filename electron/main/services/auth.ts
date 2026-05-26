import bcrypt from 'bcryptjs'
import { getDb } from '../db/connection'
import { mapWaiter } from '../db/mappers'
import { getApi, resetApi } from './apiClient'
import { getSettings, setSettings } from './settings'
import type { ServerLoginResult, Waiter } from '@shared/types'

const MAX_ATTEMPTS = 5
const LOCK_MS = 60_000

function mapRole(backendRole: string): string {
  switch (backendRole) {
    case 'SUPER_AFITSANT': return 'super_waiter'
    case 'AFITSANT': return 'waiter'
    case 'MANAGER': return 'manager'
    case 'SUPERADMIN': return 'manager'
    default: return 'waiter'
  }
}

export async function loginWithServer(identifier: string, password: string): Promise<ServerLoginResult> {
  const api = getApi()
  try {
    const res = await api.post('/api/auth/login', { identifier, password })
    const { accessToken, user } = res.data as any

    setSettings({ apiToken: accessToken })
    resetApi()

    const branches = await fetchBranches(accessToken)

    if (user.branchId) {
      setSettings({ branchId: user.branchId })
      await syncWaitersForBranch(user.branchId)
    }

    return { ok: true, token: accessToken, user, branches }
  } catch (e: any) {
    const msg = e?.response?.data?.message
    const text = Array.isArray(msg) ? msg[0] : (msg ?? 'Login xatosi')
    return { ok: false, message: text }
  }
}

async function fetchBranches(token: string): Promise<any[]> {
  try {
    const api = getApi()
    const res = await api.get('/api/branch/my', {
      headers: { Authorization: `Bearer ${token}` }
    })
    return Array.isArray(res.data) ? res.data : []
  } catch {
    return []
  }
}

export async function selectBranch(branchId: string, branchName: string): Promise<{ ok: boolean }> {
  try {
    setSettings({ branchId, organizationName: branchName })
    await syncWaitersForBranch(branchId)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function syncWaitersForBranch(branchId: string): Promise<void> {
  const api = getApi()
  try {
    const res = await api.get(`/api/user/my/${branchId}`)
    const data = res.data as any
    const users: any[] = Array.isArray(data) ? data : (data?.data ?? [])
    const afitsants = users.filter((u: any) =>
      u.role === 'AFITSANT' || u.role === 'SUPER_AFITSANT' || u.role === 'MANAGER'
    )
    const db = getDb()
    const now = Date.now()
    const stmt = db.prepare(
      `INSERT INTO waiters (server_id, first_name, last_name, phone, pin_hash, role, is_active, failed_attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
       ON CONFLICT(server_id) DO UPDATE SET
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         phone = excluded.phone,
         role = excluded.role,
         is_active = 1,
         updated_at = excluded.updated_at`
    )
    const tx = db.transaction(() => {
      for (const u of afitsants) {
        const existing = db.prepare(`SELECT pin_hash FROM waiters WHERE server_id = ?`).get(u.id) as any
        const phone = u.phoneNumer ?? u.phone ?? ''
        const defaultPin = phone.length >= 4 ? phone.slice(-4) : '1234'
        const pinHash = existing?.pin_hash ?? bcrypt.hashSync(defaultPin, 8)
        stmt.run(u.id, u.firstName, u.lastName, phone, pinHash, mapRole(u.role), now, now)
      }
    })
    tx()
  } catch (e: any) {
    console.error('Sync waiters error:', e?.message)
  }
}

export function listWaiters(): Waiter[] {
  const rows = getDb()
    .prepare(`SELECT * FROM waiters WHERE is_active = 1 ORDER BY role DESC, first_name`)
    .all() as any[]
  return rows.map(mapWaiter)
}

export function verifyPin(waiterId: number, pin: string): {
  ok: boolean
  waiter?: Waiter
  lockedUntil?: number
  attemptsLeft?: number
  message?: string
} {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM waiters WHERE id = ?`).get(waiterId) as any
  if (!row || !row.is_active) return { ok: false, message: 'Afitsant topilmadi' }

  const now = Date.now()
  if (row.locked_until && row.locked_until > now) {
    return { ok: false, lockedUntil: row.locked_until, message: 'Bloklangan' }
  }

  const matches = bcrypt.compareSync(pin, row.pin_hash)
  if (!matches) {
    const attempts = (row.failed_attempts ?? 0) + 1
    if (attempts >= MAX_ATTEMPTS) {
      const lockedUntil = now + LOCK_MS
      db.prepare(
        `UPDATE waiters SET failed_attempts = 0, locked_until = ?, updated_at = ? WHERE id = ?`
      ).run(lockedUntil, now, waiterId)
      return { ok: false, lockedUntil, message: '5 ta xato — 1 daqiqaga bloklandi' }
    }
    db.prepare(
      `UPDATE waiters SET failed_attempts = ?, updated_at = ? WHERE id = ?`
    ).run(attempts, now, waiterId)
    return { ok: false, attemptsLeft: MAX_ATTEMPTS - attempts, message: "Noto'g'ri PIN" }
  }

  db.prepare(
    `UPDATE waiters SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?`
  ).run(now, waiterId)

  const fresh = db.prepare(`SELECT * FROM waiters WHERE id = ?`).get(waiterId) as any
  return { ok: true, waiter: mapWaiter(fresh) }
}
