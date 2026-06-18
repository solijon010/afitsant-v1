import { Router } from 'express'
import { getDb } from '../db/connection'
import { getSettings } from '../services/settings'

const router = Router()

router.get('/', (req, res) => {
  let dbOk = false
  try {
    getDb().prepare('SELECT 1').get()
    dbOk = true
  } catch {}

  const s = getSettings()
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk,
    remoteUrl: s.serverUrl,
    hasToken: !!s.apiToken,
    uptime: Math.floor(process.uptime()),
    ts: Date.now()
  })
})

export default router
