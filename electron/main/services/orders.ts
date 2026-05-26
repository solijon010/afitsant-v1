import { randomUUID } from 'node:crypto'
import { getDb } from '../db/connection'
import { mapOrder, mapOrderItem } from '../db/mappers'
import type { Order, OrderItem } from '@shared/types'
import { enqueue } from './syncQueue'

const now = () => Date.now()

export function upsertOpenOrder(input: {
  tableId: number
  waiterId: number
  serviceFeePercent: number
  notes?: string | null
}): Order {
  const db = getDb()
  const existing = db
    .prepare(`SELECT * FROM orders WHERE table_id = ? AND status = 'open' LIMIT 1`)
    .get(input.tableId) as any

  if (existing) return mapOrder(existing)

  const localUuid = randomUUID()
  const ts = now()
  const info = db
    .prepare(
      `INSERT INTO orders (local_uuid, table_id, waiter_id, status, subtotal, service_fee, total, opened_at, notes, sync_status, created_at, updated_at)
       VALUES (?, ?, ?, 'open', 0, 0, 0, ?, ?, 'pending', ?, ?)`
    )
    .run(localUuid, input.tableId, input.waiterId, ts, input.notes ?? null, ts, ts)

  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(info.lastInsertRowid) as any
  enqueue('order', Number(info.lastInsertRowid), 'create', {
    localUuid,
    tableId: input.tableId,
    waiterId: input.waiterId,
    serviceFeePercent: input.serviceFeePercent,
    notes: input.notes ?? null
  })
  return mapOrder(order)
}

export function addItems(
  orderId: number,
  items: Array<{
    productId: number
    productName: string
    unitPrice: number
    quantity: number
    notes?: string | null
    localUuid: string
  }>
): OrderItem[] {
  const db = getDb()
  const ts = now()
  const inserted: OrderItem[] = []

  const insert = db.prepare(
    `INSERT INTO order_items (local_uuid, order_id, product_id, product_name, unit_price, quantity, notes, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  )

  const tx = db.transaction(() => {
    for (const it of items) {
      const info = insert.run(
        it.localUuid,
        orderId,
        it.productId,
        it.productName,
        it.unitPrice,
        it.quantity,
        it.notes ?? null,
        ts,
        ts
      )
      const row = db.prepare(`SELECT * FROM order_items WHERE id = ?`).get(info.lastInsertRowid) as any
      inserted.push(mapOrderItem(row))
    }
    recalculateOrder(orderId)
  })
  tx()

  enqueue('order_items', orderId, 'create', {
    orderId,
    items: items.map((i) => ({
      localUuid: i.localUuid,
      productId: i.productId,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      notes: i.notes ?? null
    }))
  })

  return inserted
}

export function updateItem(itemId: number, patch: { quantity?: number; notes?: string | null }): OrderItem {
  const db = getDb()
  const ts = now()
  const existing = db.prepare(`SELECT * FROM order_items WHERE id = ?`).get(itemId) as any
  if (!existing) throw new Error('Item topilmadi')

  db.prepare(
    `UPDATE order_items SET quantity = COALESCE(?, quantity), notes = COALESCE(?, notes), sync_status = 'pending', updated_at = ? WHERE id = ?`
  ).run(patch.quantity ?? null, patch.notes ?? null, ts, itemId)

  recalculateOrder(existing.order_id)
  const row = db.prepare(`SELECT * FROM order_items WHERE id = ?`).get(itemId) as any
  enqueue('order_item', itemId, 'update', { localUuid: existing.local_uuid, ...patch })
  return mapOrderItem(row)
}

export function removeItem(itemId: number): void {
  const db = getDb()
  const existing = db.prepare(`SELECT * FROM order_items WHERE id = ?`).get(itemId) as any
  if (!existing) return
  db.prepare(`DELETE FROM order_items WHERE id = ?`).run(itemId)
  recalculateOrder(existing.order_id)
  enqueue('order_item', itemId, 'delete', { localUuid: existing.local_uuid })
}

export function closeOrder(orderId: number): Order {
  const db = getDb()
  const ts = now()
  db.prepare(
    `UPDATE orders SET status = 'closed', closed_at = ?, printed_at = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`
  ).run(ts, ts, ts, orderId)
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any
  enqueue('order', orderId, 'update', { status: 'closed', closedAt: ts, printedAt: ts })
  return mapOrder(row)
}

export function cancelOrder(orderId: number): Order {
  const db = getDb()
  const ts = now()
  db.prepare(
    `UPDATE orders SET status = 'cancelled', closed_at = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`
  ).run(ts, ts, orderId)
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any
  enqueue('order', orderId, 'update', { status: 'cancelled', closedAt: ts })
  return mapOrder(row)
}

function recalculateOrder(orderId: number): void {
  const db = getDb()
  const items = db
    .prepare(`SELECT unit_price, quantity FROM order_items WHERE order_id = ?`)
    .all(orderId) as Array<{ unit_price: number; quantity: number }>
  const subtotal = items.reduce((s, it) => s + Math.round(it.unit_price * it.quantity), 0)

  const feeRow = db
    .prepare(`SELECT value FROM settings WHERE key = 'serviceFeePercent'`)
    .get() as { value: string } | undefined
  const pct = feeRow ? Number(feeRow.value) : 0
  const serviceFee = Math.round((subtotal * pct) / 100)
  const total = subtotal + serviceFee

  db.prepare(
    `UPDATE orders SET subtotal = ?, service_fee = ?, total = ?, updated_at = ? WHERE id = ?`
  ).run(subtotal, serviceFee, total, now(), orderId)
}
