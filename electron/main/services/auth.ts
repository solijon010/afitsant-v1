import bcrypt from 'bcryptjs'
import { getDb } from '../db/connection'
import { mapWaiter } from '../db/mappers'
import type { Waiter } from '@shared/types'

const MAX_ATTEMPTS = 5
const LOCK_MS = 60_000

export function listWaiters(): Waiter[] {
  const rows = getDb()
    .prepare(`SELECT * FROM waiters WHERE is_active = 1 ORDER BY first_name`)
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
