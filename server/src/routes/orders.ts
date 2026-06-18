import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { getDb } from '../db/connection'
import { getSettings } from '../services/settings'
import { syncAllItems } from '../services/orderSync'
import { updateRemoteOrderStatus } from '../services/remoteApi'
import type { AuthRequest } from '../middleware/auth'

const router = Router()
const now = () => Date.now()

function recalcOrder(orderId: number): void {
  const db = getDb()
  const items = db.prepare('SELECT unit_price, quantity FROM order_items WHERE order_id = ?').all(orderId) as any[]
  const subtotal = items.reduce((s, it) => s + Math.round(it.unit_price * it.quantity), 0)
  const pct = Number((db.prepare(`SELECT value FROM settings WHERE key = 'serviceFeePercent'`).get() as any)?.value ?? 0)
  const serviceFee = Math.round((subtotal * pct) / 100)
  db.prepare('UPDATE orders SET subtotal = ?, service_fee = ?, total = ?, updated_at = ? WHERE id = ?').run(subtotal, serviceFee, subtotal + serviceFee, now(), orderId)
}

function getOrderWithItems(orderId: number): any {
  const db = getDb()
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any
  if (!order) return null
  const items = db.prepare('SELECT oi.*, p.server_id AS product_server_id FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ? ORDER BY oi.id').all(orderId)
  return { ...order, items }
}

// ─── list ─────────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const db = getDb()
  const { status, tableId } = req.query
  let sql = 'SELECT * FROM orders WHERE 1=1'
  const params: any[] = []
  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (tableId) { sql += ' AND table_id = ?'; params.push(tableId) }
  sql += ' ORDER BY created_at DESC LIMIT 200'
  res.json(db.prepare(sql).all(...params))
})

// ─── get one ─────────────────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const order = getOrderWithItems(Number(req.params.id))
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' })
  res.json(order)
})

// ─── create ───────────────────────────────────────────────────────────────────

router.post('/', (req: AuthRequest, res, next) => {
  try {
    const { tableId, waiterId, notes } = req.body as { tableId: number; waiterId?: number; notes?: string }
    if (!tableId) return res.status(400).json({ error: 'tableId talab qilinadi' })

    const db = getDb()
    const existing = db.prepare(`SELECT * FROM orders WHERE table_id = ? AND status = 'open' LIMIT 1`).get(tableId) as any
    if (existing) return res.json(getOrderWithItems(existing.id))

    const ts = now()
    const info = db.prepare(`
      INSERT INTO orders (local_uuid, table_id, waiter_id, status, subtotal, service_fee, total, opened_at, notes, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, 'open', 0, 0, 0, ?, ?, 'pending', ?, ?)
    `).run(randomUUID(), tableId, waiterId ?? req.waiterId ?? 1, ts, notes ?? null, ts, ts)

    res.status(201).json(getOrderWithItems(info.lastInsertRowid as number))
  } catch (e) { next(e) }
})

// ─── add / update items ───────────────────────────────────────────────────────

router.post('/:id/items', (req, res, next) => {
  try {
    const orderId = Number(req.params.id)
    const { items } = req.body as { items: Array<{ productId: number; productName: string; unitPrice: number; quantity: number; notes?: string; localUuid?: string }> }
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items talab qilinadi' })

    const db = getDb()
    const ts = now()
    const upsert = db.prepare(`
      INSERT INTO order_items (local_uuid, order_id, product_id, product_name, unit_price, quantity, notes, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      ON CONFLICT(local_uuid) DO UPDATE SET
        quantity = excluded.quantity, notes = excluded.notes, unit_price = excluded.unit_price,
        sync_status = 'pending', updated_at = excluded.updated_at
    `)
    db.transaction(() => {
      for (const it of items) {
        upsert.run(it.localUuid ?? randomUUID(), orderId, it.productId, it.productName, it.unitPrice, it.quantity, it.notes ?? null, ts, ts)
      }
      recalcOrder(orderId)
      db.prepare(`UPDATE orders SET sync_status = 'pending', updated_at = ? WHERE id = ?`).run(ts, orderId)
    })()

    res.json(getOrderWithItems(orderId))
  } catch (e) { next(e) }
})

router.patch('/:id/items/:itemId', (req, res, next) => {
  try {
    const db = getDb()
    const ts = now()
    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(Number(req.params.itemId)) as any
    if (!item) return res.status(404).json({ error: 'Item topilmadi' })

    const { quantity, notes } = req.body
    const newQty = quantity !== undefined ? quantity : item.quantity
    const newNotes = 'notes' in req.body ? notes : item.notes
    db.prepare(`UPDATE order_items SET quantity = ?, notes = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`).run(newQty, newNotes, ts, item.id)
    recalcOrder(item.order_id)
    db.prepare(`UPDATE orders SET sync_status = 'pending', updated_at = ? WHERE id = ?`).run(ts, item.order_id)
    res.json(db.prepare('SELECT * FROM order_items WHERE id = ?').get(item.id))
  } catch (e) { next(e) }
})

router.delete('/:id/items/:itemId', (req, res, next) => {
  try {
    const db = getDb()
    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(Number(req.params.itemId)) as any
    if (!item) return res.status(404).json({ error: 'Item topilmadi' })
    db.prepare('DELETE FROM order_items WHERE id = ?').run(item.id)
    recalcOrder(item.order_id)
    db.prepare(`UPDATE orders SET sync_status = 'pending', updated_at = ? WHERE id = ?`).run(now(), item.order_id)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// ─── sync items to remote server ──────────────────────────────────────────────

router.post('/:id/sync', async (req, res, next) => {
  try {
    const orderId = Number(req.params.id)
    const db = getDb()
    const order = db.prepare(`
      SELECT o.*, t.server_id AS room_server_id
      FROM orders o JOIN tables t ON o.table_id = t.id
      WHERE o.id = ?
    `).get(orderId) as any
    if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' })
    if (!order.room_server_id) return res.status(400).json({ error: 'Xona server ID yo\'q' })

    const items = db.prepare(`
      SELECT oi.quantity, p.server_id AS product_server_id
      FROM order_items oi JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `).all(orderId) as any[]

    const syncItems = items
      .filter((it) => it.product_server_id && it.quantity > 0)
      .map((it) => ({ productServerId: it.product_server_id, count: it.quantity }))

    const result = await syncAllItems({ localOrderId: orderId, roomServerId: order.room_server_id, items: syncItems })
    res.json({ serverId: result.serverId })
  } catch (e) { next(e) }
})

// ─── close ────────────────────────────────────────────────────────────────────

router.post('/:id/close', async (req, res, next) => {
  try {
    const orderId = Number(req.params.id)
    const db = getDb()
    const ts = now()
    db.prepare(`UPDATE orders SET status = 'closed', closed_at = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`).run(ts, ts, orderId)
    const order = db.prepare(`SELECT o.*, t.server_id AS room_server_id FROM orders o JOIN tables t ON o.table_id = t.id WHERE o.id = ?`).get(orderId) as any
    if (order?.server_id) {
      try { await updateRemoteOrderStatus(order.server_id, 'SUCCESS') } catch {}
    }
    res.json(getOrderWithItems(orderId))
  } catch (e) { next(e) }
})

// ─── cancel ───────────────────────────────────────────────────────────────────

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const orderId = Number(req.params.id)
    const db = getDb()
    const ts = now()
    db.prepare(`UPDATE orders SET status = 'cancelled', closed_at = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`).run(ts, ts, orderId)
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any
    if (order?.server_id) {
      try { await updateRemoteOrderStatus(order.server_id, 'CANCELED') } catch {}
    }
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
