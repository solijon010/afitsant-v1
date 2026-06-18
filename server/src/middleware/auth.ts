import type { Request, Response, NextFunction } from 'express'
import { getDb } from '../db/connection'
import bcrypt from 'bcryptjs'

export interface AuthRequest extends Request {
  waiterId?: number
  waiterRole?: string
}

/**
 * Waiter sessionini tekshirish.
 * Header: Authorization: Bearer <session_token>
 * yoki `x-waiter-id` header (ichki ishlatish uchun).
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' })
    return
  }

  const token = header.slice(7)
  const db = getDb()

  const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, Date.now()) as any
  if (!session) {
    res.status(401).json({ error: 'Token yaroqsiz yoki muddati tugagan' })
    return
  }

  req.waiterId = session.waiter_id
  req.waiterRole = session.role ?? 'waiter'
  next()
}

export function requireManager(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.waiterRole !== 'manager' && req.waiterRole !== 'super_waiter') {
    res.status(403).json({ error: 'Manager huquqi talab qilinadi' })
    return
  }
  next()
}
