import bcrypt from 'bcryptjs'
import { getDb } from '../db/connection'
import { mapWaiter } from '../db/mappers'
import { getApi, resetApi } from './apiClient'
import { getSettings, setSettings } from './settings'
import { restartSync } from './syncEngine'
import type { ServerLoginResult, ServerUser, Waiter } from '@shared/types'

const MAX_ATTEMPTS = 5
const LOCK_MS = 60_000

function mapRole(backendRole: string): string {
  switch (backendRole) {
    case 'SUPER_AFITSANT':
    case 'SUPER_WAITER':
      return 'super_waiter'
    case 'AFITSANT':
    case 'WAITER':
      return 'waiter'
    case 'MANAGER':
    case 'SUPERADMIN':
      return 'manager'
    default:
      return 'waiter'
  }
}

function normalizeUsers(users: ServerUser[]): ServerUser[] {
  return users.filter((u) => u.role !== 'SUPERADMIN')
}

async function persistServerUsers(users: ServerUser[], deactivateOthers = false): Promise<void> {
  const normalized = normalizeUsers(users)
  if (normalized.length === 0) return

  const db = getDb()
  const now = Date.now()
  const serverIds = new Set(normalized.map((u) => String(u.id)))

  if (deactivateOthers) {
    db.prepare(`UPDATE waiters SET is_active = 0`).run()
  } else {
    const allLocal = db.prepare(`SELECT server_id FROM waiters WHERE server_id IS NOT NULL`).all() as Array<{ server_id: string }>
    db.transaction(() => {
      for (const row of allLocal) {
        if (!serverIds.has(String(row.server_id))) {
          db.prepare(`UPDATE waiters SET is_active = 0 WHERE server_id = ?`).run(row.server_id)
        }
      }
    })()
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

  // bcrypt.hash async — avval barcha hash'larni hisoblaymiz, keyin bitta transaksiyada saqlaymiz
  type UserRow = { user: ServerUser; phone: string; pinHash: string }
  const rows: UserRow[] = []
  for (const user of normalized) {
    const existing = db.prepare(`SELECT pin_hash FROM waiters WHERE server_id = ?`).get(user.id) as { pin_hash?: string } | undefined
    const phone = user.phoneNumer ?? ''
    const pinHash = existing?.pin_hash ?? await bcrypt.hash(phone.length >= 4 ? phone.slice(-4) : '1234', 8)
    rows.push({ user, phone, pinHash })
  }

  db.transaction(() => {
    for (const { user, phone, pinHash } of rows) {
      stmt.run(user.id, user.firstName, user.lastName ?? '', phone, pinHash, mapRole(user.role), now, now)
    }
  })()
}

export async function loginWithServer(identifier: string, password: string): Promise<ServerLoginResult> {
  const s = getSettings()
  console.log(`[AUTH] loginWithServer called - serverUrl: ${s.serverUrl}, identifier: ${identifier}`)
  const api = getApi()

  try {
    const res = await api.post('/api/auth/login', { identifier, password })
    const { accessToken, user } = res.data as any

    setSettings({ apiToken: accessToken })
    resetApi()
    restartSync()

    const branches = await fetchBranches(accessToken)

    let branchId: string | null = user.branchId ?? null
    try {
      const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString())
      if (payload.branchId) branchId = payload.branchId
    } catch {}

    if (branchId) {
      setSettings({ branchId })
      restartSync()
    }

    if (user) {
      const role = user.role ?? ''
      const isWaiterOnly =
        role === 'AFITSANT' ||
        role === 'SUPER_AFITSANT' ||
        role === 'WAITER' ||
        role === 'SUPER_WAITER'
      await persistServerUsers([user], isWaiterOnly)
    }

    await syncWaitersForBranch(branchId)

    return { ok: true, token: accessToken, user, branches }
  } catch (e: any) {
    const status = e?.response?.status
    const msg = e?.response?.data?.message
    const errCode = e?.code ?? ''
    const errMsg = e?.message ?? ''

    let text: string
    if (!e?.response) {
      text = `Server bilan ulanishda xatolik: ${errCode || errMsg}`
    } else if (Array.isArray(msg)) {
      text = msg[0]
    } else {
      text = msg ?? `Server xatosi ${status ?? ''}`
    }

    console.error('[AUTH] loginWithServer error:', {
      code: errCode,
      status,
      msg: errMsg,
      data: e?.response?.data
    })
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
    restartSync()
    await syncWaitersForBranch(branchId)
    const { fullPull } = await import('./syncEngine')
    await fullPull()
    console.log('[AUTH] selectBranch: fullPull completed')
    return { ok: true }
  } catch (e: any) {
    console.error('[AUTH] selectBranch error:', e?.message)
    return { ok: false }
  }
}

export async function syncWaitersForBranch(branchId?: string | null): Promise<void> {
  const api = getApi()
  try {
    const urls = branchId
      ? [`/api/user/my/${branchId}`, '/api/user/waiters']
      : ['/api/user/waiters']

    let users: ServerUser[] = []
    for (const url of urls) {
      try {
        const res = await api.get(url)
        const data = res.data as any
        const list: ServerUser[] = Array.isArray(data) ? data : (data?.data ?? [])
        console.log(`[WAITERS] ${url} -> ${list.length} ta`)
        if (list.length > users.length) users = list
      } catch (err: any) {
        console.warn(`[WAITERS] ${url} xato:`, err?.message)
      }
    }

    const waiters = normalizeUsers(users)
    console.log(`[WAITERS] Jami: ${users.length}, filtrdan o'tdi: ${waiters.length}`)
    console.log(`[WAITERS] Ro'yxat:`, waiters.map((u) => `${u.firstName} ${u.lastName ?? ''} (${u.role})`).join(' | '))

    if (waiters.length > 0) {
      await persistServerUsers(waiters)
    }

    console.log(`[WAITERS] Sync tugadi - ${waiters.length} ta afitsant saqlandi`)
  } catch (e: any) {
    console.error('[WAITERS] Sync error:', e?.message)
  }
}

export async function setWaiterPin(waiterId: number, pin: string): Promise<{ ok: boolean; message?: string }> {
  if (!/^\d{4}$/.test(pin)) return { ok: false, message: "PIN 4 ta raqam bo'lishi kerak" }
  const db = getDb()
  const row = db.prepare(`SELECT id FROM waiters WHERE id = ?`).get(waiterId) as any
  if (!row) return { ok: false, message: 'Afitsant topilmadi' }
  const hash = await bcrypt.hash(pin, 8)
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
      return { ok: false, lockedUntil, message: '5 ta xato - 1 daqiqaga bloklandi' }
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
