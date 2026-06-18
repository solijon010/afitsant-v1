/**
 * Afisant POS — Standalone REST API Server
 *
 * Muhit o'zgaruvchilari (.env):
 *   DB_PATH        — SQLite fayl yo'li (majburiy)
 *   PORT           — HTTP port, default 3001
 *   REMOTE_API_URL — Remote server URL, default https://api-restaurant.hisobchim.uz
 *   API_TOKEN      — Initial API token (ixtiyoriy)
 *   BRANCH_ID      — Branch ID (ixtiyoriy)
 */
import 'dotenv/config'
import express from 'express'
import { closeDb } from './db/connection'
import { errorHandler, notFound } from './middleware/error'
import authRouter from './routes/auth'
import menuRouter from './routes/menu'
import tablesRouter from './routes/tables'
import ordersRouter from './routes/orders'
import settingsRouter from './routes/settings'
import healthRouter from './routes/health'

const PORT = Number(process.env.PORT ?? 3001)

const app = express()
app.use(express.json({ limit: '1mb' }))

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Waiter-Id')
  if (req.method === 'OPTIONS') { res.sendStatus(204); return }
  next()
})

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/health', healthRouter)
app.use('/auth', authRouter)
app.use('/menu', menuRouter)
app.use('/tables', tablesRouter)
app.use('/orders', ordersRouter)
app.use('/settings', settingsRouter)

// ─── Error handlers ───────────────────────────────────────────────────────────
app.use(notFound)
app.use(errorHandler)

// ─── Start ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[SERVER] Afisant API — http://localhost:${PORT}`)
  console.log(`[SERVER] DB: ${process.env.DB_PATH ?? '(not set)'}`)
})

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const shutdown = () => {
  server.close(() => {
    closeDb()
    console.log('[SERVER] Gracefully stopped')
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 5000)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export default app
