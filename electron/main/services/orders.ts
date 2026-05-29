import { randomUUID } from 'node:crypto'
import { getDb } from '../db/connection'
import { mapOrder, mapOrderItem } from '../db/mappers'
import { getApi } from './apiClient'
import { getSettings } from './settings'
import type { Order, OrderItem, OrderWithItems } from '@shared/types'
import { enqueue } from './syncQueue'

const now = () => Date.now()

function buildOrderWithItems(orderId: number): OrderWithItems | null {
  const db = getDb()
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any
  if (!order) return null
  const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id`).all(orderId) as any[]
  return { ...mapOrder(order), items: items.map(mapOrderItem) }
}

export async function getOrderByRoom(roomServerId: string): Promise<OrderWithItems | null> {
  const s = getSettings()
  if (!s.apiToken) return null

  const api = getApi()
  try {
    const endpoint = s.branchId
      ? `/api/order/branch/${s.branchId}?limit=50`
      : `/api/order/room/${roomServerId}`
    const res = await api.get(endpoint)
    const data = res.data as any
    const orders: any[] = Array.isArray(data) ? data : (data?.data ?? [])
    const active = orders.find(
      (o: any) =>
        o.room?.id === roomServerId &&
        (o.status === 'PENDING' || o.status === 'READY')
    )
    if (!active) return null

    const table = getDb()
      .prepare(`SELECT * FROM tables WHERE server_id = ?`)
      .get(roomServerId) as any
    const tableId = table?.id ?? 0

    const waiter = getDb()
      .prepare(`SELECT * FROM waiters WHERE server_id = ?`)
      .get(active.user?.id ?? '') as any
    const waiterId = waiter?.id ?? 1

    const items = (active.orderItem ?? [])
      .filter((it: any) => it.status !== 'CANCELED')
      .map((it: any, idx: number) => {
        const product = getDb()
          .prepare(`SELECT * FROM products WHERE server_id = ?`)
          .get(it.product?.id ?? '') as any
        return {
          id: idx + 1,
          serverId: it.id,
          localUuid: it.id,
          orderId: 0,
          productId: product?.id ?? 0,
          productName: it.product?.name ?? '',
          unitPrice: Math.round(Number(it.product?.price ?? 0)),
          quantity: Number(it.count ?? 1),
          notes: null,
          syncStatus: 'synced' as const,
          createdAt: now(),
          updatedAt: now()
        }
      })

    const subtotal = items.reduce((s: number, it: any) => s + it.unitPrice * it.quantity, 0)

    return {
      id: 0,
      serverId: active.id,
      localUuid: active.id,
      tableId,
      waiterId,
      status: 'open',
      subtotal,
      serviceFee: 0,
      total: subtotal,
      openedAt: new Date(active.createdAt).getTime(),
      closedAt: null,
      printedAt: null,
      notes: null,
      syncStatus: 'synced',
      createdAt: new Date(active.createdAt).getTime(),
      updatedAt: now(),
      items
    }
  } catch (e: any) {
    console.error('getOrderByRoom error:', e?.message)
    return null
  }
}

export async function syncAllItems(input: {
  roomServerId: string
  waiterServerId: string
  items: Array<{ productServerId: string; count: number }>
}): Promise<{ serverId: string }> {
  const s = getSettings()
  if (!s.apiToken) throw new Error('Token yo\'q')

  const api = getApi()
  const { roomServerId, waiterServerId, items } = input

  // Mavjud orderni topishga urinib ko'ramiz (403 bo'lsa o'tkazib yuboramiz)
  let existing: any = null
  try {
    if (s.branchId) {
      const res = await api.get(`/api/order/branch/${s.branchId}?limit=50`)
      const data = res.data as any
      const orders: any[] = Array.isArray(data) ? data : (data?.data ?? [])
      existing = orders.find(
        (o: any) => o.room?.id === roomServerId && (o.status === 'PENDING' || o.status === 'READY')
      ) ?? null
    }
  } catch {
    // 403 yoki boshqa xato — mavjud order yo'q deb hisoblaymiz
    existing = null
  }

  if (existing) {
    if (items.length === 0) {
      await api.patch(`/api/order/status/${existing.id}`, null, { params: { status: 'CANCELED' } })
      return { serverId: existing.id }
    }
    await api.patch(`/api/order/sync-items/${existing.id}`, { items })
    return { serverId: existing.id }
  }

  if (items.length === 0) throw new Error('Savat bo\'sh — order yaratilmadi')

  const createRes = await api.post('/api/order', {
    roomId: roomServerId,
    waiterId: waiterServerId,
    orderItems: items.map((it) => ({ productId: it.productServerId, count: it.count }))
  })
  return { serverId: createRes.data.id }
}

export async function closeOrderOnServer(serverOrderId: string): Promise<void> {
  const api = getApi()
  await api.patch(`/api/order/status/${serverOrderId}`, null, { params: { status: 'SUCCESS' } })
}

export async function cancelOrderOnServer(serverOrderId: string): Promise<void> {
  const api = getApi()
  await api.patch(`/api/order/status/${serverOrderId}`, null, { params: { status: 'CANCELED' } })
}

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
  return inserted
}

export function updateItem(itemId: number, patch: { quantity?: number; notes?: string | null }): OrderItem {
  const db = getDb()
  const ts = now()
  const existing = db.prepare(`SELECT * FROM order_items WHERE id = ?`).get(itemId) as any
  if (!existing) throw new Error('Item topilmadi')

  // COALESCE ishlatilmaydi — notes = null bo'lganda eski qiymat o'rnini egallaydi.
  // Buning o'rniga faqat berilgan maydonlarni yangilash uchun shart ishlatiladi.
  const newQuantity = patch.quantity !== undefined ? patch.quantity : existing.quantity
  const newNotes    = 'notes' in patch ? patch.notes : existing.notes

  db.prepare(
    `UPDATE order_items SET quantity = ?, notes = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`
  ).run(newQuantity, newNotes, ts, itemId)

  recalculateOrder(existing.order_id)
  const row = db.prepare(`SELECT * FROM order_items WHERE id = ?`).get(itemId) as any
  return mapOrderItem(row)
}

export function removeItem(itemId: number): void {
  const db = getDb()
  const existing = db.prepare(`SELECT * FROM order_items WHERE id = ?`).get(itemId) as any
  if (!existing) return
  db.prepare(`DELETE FROM order_items WHERE id = ?`).run(itemId)
  recalculateOrder(existing.order_id)
}

export function closeOrder(orderId: number): Order {
  const db = getDb()
  const ts = now()
  db.prepare(
    `UPDATE orders SET status = 'closed', closed_at = ?, printed_at = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`
  ).run(ts, ts, ts, orderId)
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any
  return mapOrder(row)
}

export function cancelOrder(orderId: number): Order {
  const db = getDb()
  const ts = now()
  db.prepare(
    `UPDATE orders SET status = 'cancelled', closed_at = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`
  ).run(ts, ts, orderId)
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any
  return mapOrder(row)
}

function recalculateOrder(orderId: number): void {
  const db = getDb()
  const items = db
    .prepare(`SELECT unit_price, quantity FROM order_items WHERE order_id = ?`)
    .all(orderId) as Array<{ unit_price: number; quantity: number }>
  const subtotal = items.reduce((s, it) => s + Math.round(it.unit_price * it.quantity), 0)
  const feeRow = db.prepare(`SELECT value FROM settings WHERE key = 'serviceFeePercent'`).get() as { value: string } | undefined
  const pct = feeRow ? Number(feeRow.value) : 0
  const serviceFee = Math.round((subtotal * pct) / 100)
  const total = subtotal + serviceFee
  db.prepare(
    `UPDATE orders SET subtotal = ?, service_fee = ?, total = ?, updated_at = ? WHERE id = ?`
  ).run(subtotal, serviceFee, total, now(), orderId)
}
