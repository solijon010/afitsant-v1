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
    // branchId bilan so'rov 403 bersa, xona endpointiga fallback
    let orders: any[] = []
    if (s.branchId) {
      try {
        const res = await api.get(`/api/order/branch/${s.branchId}?limit=50`)
        const data = res.data as any
        orders = Array.isArray(data) ? data : (data?.data ?? [])
      } catch (e: any) {
        console.warn(`[ORDER] /api/order/branch/${s.branchId} xato (${e?.response?.status}), room endpointga fallback`)
        try {
          const res = await api.get(`/api/order/room/${roomServerId}`)
          const data = res.data as any
          orders = Array.isArray(data) ? data : (data?.data ?? [])
        } catch { orders = [] }
      }
    } else {
      const res = await api.get(`/api/order/room/${roomServerId}`)
      const data = res.data as any
      orders = Array.isArray(data) ? data : (data?.data ?? [])
    }
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
  items: Array<{ productServerId: string; count: number }>
}): Promise<{ serverId: string }> {
  const s = getSettings()
  if (!s.apiToken) throw new Error('Token yo\'q')

  const api = getApi()
  const { roomServerId, items } = input

  // count > 0 bo'lgan itemlarni ajratamiz — server 0 li itemlarni rad etadi
  const activeItems = items.filter((it) => it.count > 0)

  // Mavjud PENDING/READY orderni topishga urinib ko'ramiz
  let existing: any = null
  try {
    let orders: any[] = []
    if (s.branchId) {
      try {
        const res = await api.get(`/api/order/branch/${s.branchId}?limit=50`)
        const data = res.data as any
        orders = Array.isArray(data) ? data : (data?.data ?? [])
      } catch (e: any) {
        console.warn(`[ORDER] /api/order/branch/${s.branchId} xato (${e?.response?.status}), room fallback`)
        try {
          const res = await api.get(`/api/order/room/${roomServerId}`)
          const data = res.data as any
          orders = Array.isArray(data) ? data : (data?.data ?? [])
        } catch { orders = [] }
      }
    } else {
      try {
        const res = await api.get(`/api/order/room/${roomServerId}`)
        const data = res.data as any
        orders = Array.isArray(data) ? data : (data?.data ?? [])
      } catch { orders = [] }
    }
    existing = orders.find((o: any) =>
      (o.room?.id === roomServerId || o.roomId === roomServerId) &&
      (o.status === 'PENDING' || o.status === 'READY')
    ) ?? null
    console.log(`[ORDER] Existing order check — found: ${existing?.id ?? 'none'}`)
  } catch (e: any) {
    console.warn('[ORDER] Existing order fetch failed:', e?.message)
    existing = null
  }

  if (existing) {
    if (activeItems.length === 0) {
      // Savat bo'sh — mavjud orderni bekor qilamiz
      await api.patch(`/api/order/${existing.id}/status`, { status: 'CANCELED' })
      return { serverId: existing.id }
    }
    // Mavjud orderni yangilash — sync-items endpointi
    try {
      await api.patch(`/api/order/sync-items/${existing.id}`, {
        items: activeItems.map((it) => ({ productId: it.productServerId, count: it.count }))
      })
      console.log(`[ORDER] Updated existing order ${existing.id}`)
    } catch (e: any) {
      // sync-items 400/404 bersa, to'liq yangi order yaratishga urinib ko'ramiz
      console.warn(`[ORDER] sync-items xato (${e?.response?.status}), yangi order yaratilmoqda...`)
      const errData = e?.response?.data
      console.warn('[ORDER] sync-items error body:', JSON.stringify(errData ?? e?.message))
      // existing orderni o'chirib, yangi yaratamiz
      try {
        await api.patch(`/api/order/${existing.id}/status`, { status: 'CANCELED' })
      } catch { /* ignore */ }
      existing = null
    }
    if (existing) return { serverId: existing.id }
  }

  if (activeItems.length === 0) throw new Error('Savat bo\'sh — order yaratilmadi')

  // Yangi order yaratish
  // waiterId ni JWT tokendan olamiz — server authorization header orqali user ni biladi
  let waiterId: string | null = null
  try {
    const payload = JSON.parse(Buffer.from(s.apiToken.split('.')[1], 'base64').toString())
    waiterId = payload.id ?? payload.userId ?? null
  } catch {}

  // branchId HECH QACHON yuborilmaydi — server "property branchId should not exist" deydi
  const body: Record<string, any> = {
    roomId: roomServerId,
    orderItems: activeItems.map((it) => ({ productId: it.productServerId, count: it.count }))
  }
  if (waiterId) body.waiterId = waiterId

  console.log('[ORDER] POST /api/order body:', JSON.stringify(body))
  try {
    const createRes = await api.post('/api/order', body)
    const newId = createRes.data?.id ?? createRes.data?.serverId
    console.log('[ORDER] Created order:', newId)
    return { serverId: newId }
  } catch (e: any) {
    const errData = e?.response?.data
    console.error('[ORDER] POST /api/order xato:', JSON.stringify(errData ?? e?.message))
    throw new Error(`Order yaratishda xato (${e?.response?.status ?? e?.code}): ${JSON.stringify(errData?.message ?? errData ?? e?.message)}`)
  }
}

export async function closeOrderOnServer(serverOrderId: string): Promise<void> {
  const api = getApi()
  // PATCH /api/order/{id}/status  bilan SUCCESS ga o'tkazish
  await api.patch(`/api/order/${serverOrderId}/status`, { status: 'SUCCESS' })
}

export async function cancelOrderOnServer(serverOrderId: string): Promise<void> {
  const api = getApi()
  await api.patch(`/api/order/${serverOrderId}/status`, { status: 'CANCELED' })
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

export function replaceOrderItems(
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

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(orderId)

    const insert = db.prepare(
      `INSERT INTO order_items (local_uuid, order_id, product_id, product_name, unit_price, quantity, notes, sync_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    for (const it of items) {
      insert.run(it.localUuid, orderId, it.productId, it.productName, it.unitPrice, it.quantity, it.notes ?? null, ts, ts)
    }
    recalculateOrder(orderId)
  })
  tx()

  const rows = db.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id`).all(orderId) as any[]
  return rows.map(mapOrderItem)
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
