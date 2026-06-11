import { randomUUID } from 'node:crypto'
import { getDb } from '../db/connection'
import { mapOrder, mapOrderItem } from '../db/mappers'
import { getApi } from './apiClient'
import { fetchVisibleOrders, isActiveServerOrder } from './orderApi'
import { getSettings } from './settings'
import type { Order, OrderItem, OrderWithItems } from '@shared/types'

const now = () => Date.now()

interface LocalOrderItemInput {
  productId: number
  productServerId?: string | null
  productName: string
  unitPrice: number
  quantity: number
  notes?: string | null
  localUuid: string
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Number(value.toFixed(3))
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} noto'g'ri`)
}

function normalizeLocalItems(items: LocalOrderItemInput[]): LocalOrderItemInput[] {
  if (!Array.isArray(items)) throw new Error('Mahsulotlar ro`yxati noto`g`ri')
  return items.map((it) => {
    const productId = Number(it.productId)
    const productServerId = it.productServerId ? String(it.productServerId).trim() : null
    const quantity = normalizeCount(Number(it.quantity))
    const unitPrice = Number(it.unitPrice)
    const productName = String(it.productName ?? '').trim()
    const localUuid = String(it.localUuid ?? '').trim()
    if (!Number.isInteger(productId) || productId < 0) throw new Error('Mahsulot ID noto`g`ri')
    if (productId <= 0 && !productServerId) throw new Error('Mahsulot server ID noto`g`ri')
    if (!productName) throw new Error('Mahsulot nomi bo`sh')
    if (!localUuid) throw new Error('Mahsulot localUuid bo`sh')
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Mahsulot narxi noto`g`ri')
    if (quantity <= 0) throw new Error('Mahsulot miqdori noto`g`ri')
    return {
      productId,
      productServerId,
      productName,
      unitPrice,
      quantity,
      notes: it.notes ?? null,
      localUuid
    }
  })
}

async function updateServerOrderStatus(orderId: string, status: 'SUCCESS' | 'CANCELED'): Promise<void> {
  const api = getApi()
  await api.patch(`/api/order/status/${orderId}`, null, { params: { status } })
}

function markOrderPending(orderId: number, ts = now()): void {
  getDb()
    .prepare(`UPDATE orders SET sync_status = 'pending', updated_at = ? WHERE id = ?`)
    .run(ts, orderId)
}

function markOrderSynced(orderId: number, serverOrderId?: string): void {
  const db = getDb()
  const ts = now()
  db.transaction(() => {
    db.prepare(
      `UPDATE orders
       SET server_id = COALESCE(?, server_id),
           sync_status = 'synced',
           updated_at = ?
       WHERE id = ?`
    ).run(serverOrderId ?? null, ts, orderId)
    db.prepare(
      `UPDATE order_items
       SET sync_status = 'synced',
           updated_at = ?
       WHERE order_id = ?`
    ).run(ts, orderId)
  })()
}

function buildOrderWithItems(orderId: number): OrderWithItems | null {
  const db = getDb()
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any
  if (!order) return null
  const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id`).all(orderId) as any[]
  return { ...mapOrder(order), items: items.map(mapOrderItem) }
}

type ServerOrderItemInput = { productServerId: string; count: number }

function normalizeServerItems(items: ServerOrderItemInput[]): ServerOrderItemInput[] {
  const merged = new Map<string, number>()
  for (const it of items) {
    const productServerId = String(it.productServerId ?? '').trim()
    const count = normalizeCount(Number(it.count))
    if (productServerId && count > 0) {
      merged.set(productServerId, normalizeCount((merged.get(productServerId) ?? 0) + count))
    }
  }
  return Array.from(merged.entries()).map(([productServerId, count]) => ({ productServerId, count }))
}

function toOrderItemDto(items: ServerOrderItemInput[]): Array<{ productId: string; count: number }> {
  return items.map((it) => ({ productId: it.productServerId, count: it.count }))
}

export async function replaceOrderItemsOnServer(serverOrderId: string, items: ServerOrderItemInput[]): Promise<void> {
  const activeItems = normalizeServerItems(items)
  if (activeItems.length === 0) {
    await updateServerOrderStatus(serverOrderId, 'CANCELED')
    return
  }
  await getApi().patch(`/api/order/${serverOrderId}`, {
    orderItems: toOrderItemDto(activeItems)
  })
}

export async function getOrderByRoom(roomServerId: string): Promise<OrderWithItems | null> {
  const s = getSettings()
  if (!s.apiToken) return null

  try {
    const orders = await fetchVisibleOrders(200)
    const active = orders.find(
      (o: any) =>
        o.room?.id === roomServerId &&
        isActiveServerOrder(o)
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
          productServerId: it.product?.id ?? null,
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
    const pct = getSettings().serviceFeePercent ?? 0
    const serviceFee = Math.round((subtotal * pct) / 100)

    return {
      id: 0,
      serverId: active.id,
      localUuid: active.id,
      tableId,
      waiterId,
      status: 'open',
      subtotal,
      serviceFee,
      total: subtotal + serviceFee,
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
  localOrderId?: number
  serverOrderId?: string
  roomServerId: string
  items: Array<{ productServerId: string; count: number }>
}): Promise<{ serverId: string }> {
  const s = getSettings()
  if (!s.apiToken) throw new Error('Token yo\'q')

  const api = getApi()
  const { localOrderId, serverOrderId, roomServerId, items } = input

  // Bu funksiya har doim POS savatining yakuniy snapshotini qabul qiladi.
  // Mavjud server order uchun /api/order/{id} ishlatiladi, chunki sync-items
  // backendda delta/additive bo'lib, itemlar dublikat bo'lishi mumkin.
  const activeItems = normalizeServerItems(items)

  // Yopilgan/bekor qilingan statuslardan boshqasi "aktiv" hisoblanadi.
  const isActive = isActiveServerOrder

  // Xona bo'yicha aktiv buyurtmani topish — room endpointidan to'g'ridan qidiramiz
  const findActiveForRoom = async (): Promise<any> => {
    const list = await fetchVisibleOrders(200)
    return list.find((o: any) =>
      (o.room?.id === roomServerId || o.roomId === roomServerId) && isActive(o)
    ) ?? null
  }

  // Mavjud aktiv orderni topamiz (barcha statuslar tekshiriladi, nafaqat PENDING/READY)
  let existing: any = serverOrderId ? { id: serverOrderId } : null
  try {
    if (!existing) {
      const orders = await fetchVisibleOrders(200)
      existing = orders.find((o: any) =>
        (o.room?.id === roomServerId || o.roomId === roomServerId) && isActive(o)
      ) ?? null

      if (!existing) {
        existing = await findActiveForRoom()
      }
    }
    console.log(`[ORDER] Existing order check — found: ${existing?.id ?? 'none'} (status: ${existing?.status ?? '-'})`)
  } catch (e: any) {
    console.warn('[ORDER] Existing order fetch failed:', e?.message)
    existing = null
  }

  if (existing) {
    if (activeItems.length === 0) {
      // Savat bo'sh — mavjud orderni bekor qilamiz
      await updateServerOrderStatus(existing.id, 'CANCELED')
      return { serverId: existing.id }
    }
    // Mavjud orderni yakuniy snapshot bilan almashtiramiz.
    try {
      await replaceOrderItemsOnServer(existing.id, activeItems)
      console.log(`[ORDER] Replaced existing order ${existing.id}`)
      if (localOrderId) markOrderSynced(localOrderId, existing.id)
    } catch (e: any) {
      const pst = e?.response?.status
      console.warn(`[ORDER] replace order items xato (${pst}): ${JSON.stringify(e?.response?.data ?? e?.message)}`)
      if (pst === 400 || pst === 404) {
        // Order topilmadi yoki holati noto'g'ri — BEKOR QILMAYMIZ, yangi order izlaymiz
        existing = null
      } else {
        // Network xato yoki server xato — keyinroq qayta urinamiz
        throw e
      }
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
    orderItems: toOrderItemDto(activeItems)
  }
  if (waiterId) body.waiterId = waiterId

  console.log('[ORDER] POST /api/order body:', JSON.stringify(body))
  try {
    const createRes = await api.post('/api/order', body)
    const newId = createRes.data?.id ?? createRes.data?.serverId
    console.log('[ORDER] Created order:', newId)
    if (localOrderId) markOrderSynced(localOrderId, newId)
    return { serverId: newId }
  } catch (e: any) {
    const errData = e?.response?.data
    const status = e?.response?.status
    console.error('[ORDER] POST /api/order xato:', JSON.stringify(errData ?? e?.message))

    // 403 "Bu honada odam bor yoki xona band" — serverda buyurtma bor, topib yangilaymiz
    if (status === 403) {
      console.warn('[ORDER] 403 — xonada aktiv buyurtma bor, topib patch qilamiz...')
      const found = await findActiveForRoom()
      if (found) {
        try {
          await replaceOrderItemsOnServer(found.id, activeItems)
          console.log('[ORDER] 403 recovery OK — replaced order:', found.id)
          if (localOrderId) markOrderSynced(localOrderId, found.id)
          return { serverId: found.id }
        } catch (patchErr: any) {
          console.warn('[ORDER] 403 recovery patch xato:', patchErr?.message)
        }
      }
    }

    throw new Error(`Order yaratishda xato (${status ?? e?.code}): "${errData?.message ?? errData ?? e?.message}"`)
  }
}

export async function closeOrderOnServer(serverOrderId: string): Promise<void> {
  await updateServerOrderStatus(serverOrderId, 'SUCCESS')
}

export async function cancelOrderOnServer(serverOrderId: string): Promise<void> {
  await updateServerOrderStatus(serverOrderId, 'CANCELED')
}

export function upsertOpenOrder(input: {
  tableId: number
  waiterId: number
  serviceFeePercent: number
  notes?: string | null
}): Order {
  assertPositiveInteger('Stol ID', input.tableId)
  assertPositiveInteger('Afitsant ID', input.waiterId)
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
  items: LocalOrderItemInput[]
): OrderItem[] {
  assertPositiveInteger('Buyurtma ID', orderId)
  const safeItems = normalizeLocalItems(items)
  const db = getDb()
  const ts = now()

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(orderId)

    const insert = db.prepare(
      `INSERT INTO order_items (local_uuid, order_id, product_id, product_server_id, product_name, unit_price, quantity, notes, sync_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    for (const it of safeItems) {
      insert.run(it.localUuid, orderId, it.productId, it.productServerId ?? null, it.productName, it.unitPrice, it.quantity, it.notes ?? null, ts, ts)
    }
    recalculateOrder(orderId)
    markOrderPending(orderId, ts)
  })
  tx()

  const rows = db.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id`).all(orderId) as any[]
  return rows.map(mapOrderItem)
}

export function addItems(
  orderId: number,
  items: LocalOrderItemInput[]
): OrderItem[] {
  assertPositiveInteger('Buyurtma ID', orderId)
  const safeItems = normalizeLocalItems(items)
  const db = getDb()
  const ts = now()
  const inserted: OrderItem[] = []

  const insert = db.prepare(
    `INSERT INTO order_items (local_uuid, order_id, product_id, product_server_id, product_name, unit_price, quantity, notes, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  )

  const tx = db.transaction(() => {
    for (const it of safeItems) {
      const info = insert.run(
        it.localUuid,
        orderId,
        it.productId,
        it.productServerId ?? null,
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
    markOrderPending(orderId, ts)
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
  if (!Number.isFinite(Number(newQuantity)) || Number(newQuantity) <= 0) {
    throw new Error('Mahsulot miqdori noto`g`ri')
  }
  const newNotes    = 'notes' in patch ? patch.notes : existing.notes

  db.prepare(
    `UPDATE order_items SET quantity = ?, notes = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`
  ).run(newQuantity, newNotes, ts, itemId)

  recalculateOrder(existing.order_id)
  markOrderPending(existing.order_id, ts)
  const row = db.prepare(`SELECT * FROM order_items WHERE id = ?`).get(itemId) as any
  return mapOrderItem(row)
}

export function removeItem(itemId: number): void {
  const db = getDb()
  const ts = now()
  const existing = db.prepare(`SELECT * FROM order_items WHERE id = ?`).get(itemId) as any
  if (!existing) return
  db.prepare(`DELETE FROM order_items WHERE id = ?`).run(itemId)
  recalculateOrder(existing.order_id)
  markOrderPending(existing.order_id, ts)
}

export function closeOrder(
  orderId: number,
  printedAt: number | null = now(),
  syncStatus: 'pending' | 'synced' = 'pending',
  serverOrderId?: string
): Order {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error('Buyurtma ID noto\'g\'ri')
  }
  const db = getDb()
  const ts = now()
  db.prepare(
    `UPDATE orders
     SET server_id = COALESCE(?, server_id),
         status = 'closed',
         closed_at = ?,
         printed_at = ?,
         sync_status = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(serverOrderId ?? null, ts, printedAt, syncStatus, ts, orderId)
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any
  if (!row) throw new Error('Buyurtma topilmadi')
  return mapOrder(row)
}

export function cancelOrder(
  orderId: number,
  syncStatus: 'pending' | 'synced' = 'pending',
  serverOrderId?: string
): Order {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error('Buyurtma ID noto\'g\'ri')
  }
  const db = getDb()
  const ts = now()
  db.prepare(
    `UPDATE orders
     SET server_id = COALESCE(?, server_id),
         status = 'cancelled',
         closed_at = ?,
         sync_status = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(serverOrderId ?? null, ts, syncStatus, ts, orderId)
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any
  if (!row) throw new Error('Buyurtma topilmadi')
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
