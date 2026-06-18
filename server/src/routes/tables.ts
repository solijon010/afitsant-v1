import { Router } from 'express'
import { getDb } from '../db/connection'

const router = Router()

/**
 * GET /tables
 * Barcha xonalar va stollar, aktiv buyurtma bilan birga.
 */
router.get('/', (req, res) => {
  const db = getDb()
  const areas = db.prepare('SELECT * FROM areas ORDER BY sort_order').all() as any[]
  const tables = db.prepare('SELECT * FROM tables ORDER BY sort_order').all() as any[]

  const activeOrders = db.prepare(`
    SELECT o.*, t.id AS tbl_id
    FROM orders o
    JOIN tables t ON o.table_id = t.id
    WHERE o.status = 'open'
  `).all() as any[]

  const orderByTable = new Map(activeOrders.map((o) => [o.tbl_id, o]))

  const result = areas.map((area) => ({
    ...area,
    tables: tables
      .filter((t) => t.area_id === area.id)
      .map((t) => ({ ...t, activeOrder: orderByTable.get(t.id) ?? null }))
  }))

  res.json(result)
})

router.get('/areas', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM areas ORDER BY sort_order').all()
  res.json(rows)
})

router.get('/:id', (req, res) => {
  const db = getDb()
  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id)
  if (!table) return res.status(404).json({ error: 'Stol topilmadi' })
  const order = db.prepare(`SELECT * FROM orders WHERE table_id = ? AND status = 'open' LIMIT 1`).get(req.params.id) ?? null
  res.json({ table, activeOrder: order })
})

export default router
