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
  const s = getSettings()
  console.log(`[AUTH] loginWithServer called — serverUrl: ${s.serverUrl}, identifier: ${identifier}`)
  const api = getApi()
  try {
    const res = await api.post('/api/auth/login', { identifier, password })
    const { accessToken, user } = res.data as any

    setSettings({ apiToken: accessToken })
    resetApi()

    const branches = await fetchBranches(accessToken)

    // branchId JWT payload ichida — uni decode qilib olamiz
    let branchId: string | null = user.branchId ?? null
    try {
      const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString())
      if (payload.branchId) branchId = payload.branchId
    } catch {}

    if (branchId) {
      setSettings({ branchId })
    }
    await syncWaitersForBranch(branchId)

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

export async function syncWaitersForBranch(branchId?: string | null): Promise<void> {
  const api = getApi()
  try {
    const res = branchId
      ? await api.get(`/api/user/my/${branchId}`)
      : await api.get(`/api/user/waiters`)
    const data = res.data as any
    const users: any[] = Array.isArray(data) ? data : (data?.data ?? [])
    const afitsants = users.filter((u: any) =>
      u.role === 'AFITSANT' || u.role === 'SUPER_AFITSANT' || u.role === 'MANAGER'
    )
    const db = getDb()
    const now = Date.now()

    // bcrypt.hash async — main thread ni bloklamaslik uchun transaction dan oldin bajaramiz
    const rows: Array<{ u: any; phone: string; pinHash: string }> = []
    for (const u of afitsants) {
      const existing = db.prepare(`SELECT pin_hash FROM waiters WHERE server_id = ?`).get(u.id) as any
      const phone = u.phoneNumer ?? u.phone ?? ''
      const pinHash: string = existing?.pin_hash
        ?? await bcrypt.hash(phone.length >= 4 ? phone.slice(-4) : '1234', 8)
      rows.push({ u, phone, pinHash })
    }

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
    db.transaction(() => {
      for (const { u, phone, pinHash } of rows) {
        stmt.run(u.id, u.firstName, u.lastName, phone, pinHash, mapRole(u.role), now, now)
      }
    })()
  } catch (e: any) {
    console.error('Sync waiters error:', e?.message)
  }
}

export async function setWaiterPin(waiterId: number, pin: string): Promise<{ ok: boolean; message?: string }> {
  if (!/^\d{4}$/.test(pin)) return { ok: false, message: "PIN 4 ta raqam bo'lishi kerak" }
  const db = getDb()
  const row = db.prepare(`SELECT id FROM waiters WHERE id = ?`).get(waiterId) as any
  if (!row) return { ok: false, message: 'Afitsant topilmadi' }
  // bcrypt.hash async — main thread ni bloklamaslik uchun
  const hash = await bcrypt.hash(pin, 8)
  // Faqat pin_hash yangilanadi — failed_attempts va locked_until teglinmaydi.
  // Blokni olib tashlash alohida admin amaliyot bo'lishi kerak.
  db.prepare(`UPDATE waiters SET pin_hash = ?, updated_at = ? WHERE id = ?`)
    .run(hash, Date.now(), waiterId)
  return { ok: true }
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

  if (!row.pin_hash) {
    return { ok: false, message: "PIN o'rnatilmagan. Sozlamalarda yangi PIN kiriting." }
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
