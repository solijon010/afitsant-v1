import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { getDb } from '../db/connection'
import { getRemoteApi, resetRemoteApi } from '../services/remoteApi'
import { patchSettings } from '../services/settings'

const router = Router()

const SESSION_TTL = 8 * 60 * 60 * 1000  // 8 soat

/**
 * POST /auth/login
 * Body: { phone, password }
 * Avval lokal DB da tekshiradi, keyin remote server ga.
 */
router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body as { phone?: string; password?: string }
    if (!phone || !password) {
      return res.status(400).json({ error: 'phone va password talab qilinadi' })
    }

    const db = getDb()

    // 1. Lokal waiter topish
    const waiter = db.prepare('SELECT * FROM waiters WHERE phone = ? AND is_active = 1').get(phone) as any
    if (waiter) {
      const ok = await bcrypt.compare(password, waiter.password_hash ?? '')
      if (ok) {
        const token = randomUUID()
        const expiresAt = Date.now() + SESSION_TTL
        // Sessions jadvalini yaratish (schema da bo'lmasa)
        db.exec(`CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          waiter_id INTEGER NOT NULL,
          role TEXT,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )`)
        db.prepare('INSERT INTO sessions (token, waiter_id, role, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(
          token, waiter.id, waiter.role, expiresAt, Date.now()
        )
        return res.json({
          token,
          waiter: {
            id: waiter.id, firstName: waiter.first_name, lastName: waiter.last_name,
            role: waiter.role, phone: waiter.phone
          },
          expiresAt
        })
      }
    }

    // 2. Remote server da tekshirish
    const remoteApi = getRemoteApi()
    let loginRes: any
    try {
      loginRes = await remoteApi.post('/api/auth/signin', { phoneNumer: phone, password })
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message
      return res.status(401).json({ error: `Login xato: ${msg}` })
    }

    const remoteToken: string = loginRes.data?.accessToken ?? loginRes.data?.token
    if (!remoteToken) return res.status(401).json({ error: 'Server token qaytarmadi' })

    // Token ni SQLite ga saqlaymiz
    patchSettings({ apiToken: remoteToken })
    resetRemoteApi()

    const user = loginRes.data?.user ?? loginRes.data
    const localToken = randomUUID()
    const expiresAt = Date.now() + SESSION_TTL

    db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      waiter_id INTEGER NOT NULL,
      role TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`)

    // Remote user ni lokal DB da topish yoki yaratish
    let localWaiter = waiter
    if (!localWaiter && user?.id) {
      localWaiter = db.prepare('SELECT * FROM waiters WHERE server_id = ?').get(user.id) as any
    }
    const waiterId = localWaiter?.id ?? 1

    db.prepare('INSERT OR REPLACE INTO sessions (token, waiter_id, role, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(
      localToken, waiterId, user?.role ?? 'waiter', expiresAt, Date.now()
    )

    return res.json({
      token: localToken,
      remoteToken,
      waiter: {
        id: user?.id, firstName: user?.firstName, lastName: user?.lastName,
        role: user?.role, phone
      },
      expiresAt
    })
  } catch (e) {
    next(e)
  }
})

router.post('/logout', (req, res) => {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7)
    try {
      const db = getDb()
      db.exec(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, waiter_id INTEGER NOT NULL, role TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`)
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    } catch {}
  }
  res.json({ ok: true })
})

export default router
