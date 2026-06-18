import { randomUUID } from 'node:crypto'
import { getDb } from '../db/connection'
import { mapOrder, mapOrderItem } from '../db/mappers'
import { getApi } from './apiClient'
import { fetchVisibleOrders } from './orderApi'
import { getSettings } from './settings'
import { tgError, tgWarn } from './telegramLogger'
import type { Order, OrderItem, OrderWithItems } from '@shared/types'

const now = () => Date.now()

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
  try {
    db.transaction(() => {
      if (serverOrderId) {
        // Boshqa buyurtma allaqachon bu server_id ni egallab turganmi?
        const conflict = db.prepare(
          `SELECT id FROM orders WHERE server_id = ? AND id != ?`
        ).get(serverOrderId, orderId) as any
        if (conflict) {
          // Conflict bor — server_id ni o'zgartirmasdan faqat synced belgilaymiz
          db.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(ts, orderId)
        } else {
          db.prepare(
            `UPDATE orders SET server_id = COALESCE(?, server_id), sync_status = 'synced', updated_at = ? WHERE id = ?`
          ).run(serverOrderId, ts, orderId)
        }
      } else {
        db.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(ts, orderId)
      }
      db.prepare(`UPDATE order_items SET sync_status = 'synced', updated_at = ? WHERE order_id = ?`).run(ts, orderId)
    })()
  } catch (e: any) {
    // UNIQUE constraint yoki boshqa xato — server_id siz synced belgilaymiz
    try {
      db.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(ts, orderId)
    } catch {}
  }
}

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

  try {
    const orders = await fetchVisibleOrders()
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
  localOrderId?: number
  roomServerId: string
  items: Array<{ productServerId: string; count: number }>
}): Promise<{ serverId: string }> {
  const s = getSettings()
  if (!s.apiToken) throw new Error('Token yo\'q')

  const api = getApi()
  const { localOrderId, roomServerId, items } = input

  // count > 0 bo'lgan itemlarni ajratamiz — server 0 li itemlarni rad etadi
  const activeItems = items.filter((it) => it.count > 0)
  // Server faqat butun sonli miqdorlarni qabul qiladi (count must be integer >= 1)
  // KG fractional itemlar (0.5, 0.46...) sync-items PATCH ga kirmaydi
  const patchItems = activeItems.filter((it) => Number.isInteger(it.count))

  // Yopilgan/bekor qilingan statuslar — bulardan boshqasi "aktiv" hisoblanadi
  const CLOSED_STATUSES = ['CANCELED', 'CANCELLED', 'SUCCESS', 'COMPLETED', 'CLOSED', 'DONE', 'FINISHED']
  const isActive = (o: any): boolean =>
    !CLOSED_STATUSES.includes((o.status ?? '').toUpperCase())

  // Mavjud aktiv orderni topamiz — bitta fetch, qayta ishlatiladi
  let allOrders: any[] = []
  let existing: any = null
  try {
    allOrders = await fetchVisibleOrders()
    existing = allOrders.find((o: any) =>
      (o.room?.id === roomServerId || o.roomId === roomServerId) && isActive(o)
    ) ?? null
    console.log(`[ORDER] Existing order check — found: ${existing?.id ?? 'none'} (status: ${existing?.status ?? '-'})`)
  } catch (e: any) {
    console.warn('[ORDER] Existing order fetch failed:', e?.message)
    existing = null
  }

  // 403 recovery uchun — allOrders dan qidiramiz (qo'shimcha fetch yo'q)
  const findActiveForRoom = (): any =>
    allOrders.find((o: any) =>
      (o.room?.id === roomServerId || o.roomId === roomServerId) && isActive(o)
    ) ?? null

  if (existing) {
    if (activeItems.length === 0) {
      // Savat bo'sh — mavjud orderni bekor qilamiz
      await updateServerOrderStatus(existing.id, 'CANCELED')
      if (localOrderId) markOrderSynced(localOrderId, existing.id)
      return { serverId: existing.id }
    }

    // BUG FIX: faqat KG items qolsa (patchItems bo'sh) — server orderni bekor qilamiz
    // Chunki `{items:[]}` serverga yuborib 400 olish mumkin, va server eski itemlarni ko'rsatishda davom etadi
    // To'g'ri xulosa: integer items yo'q = server order bekor; keyingi integer item qo'shilganda yangi order yaratiladi
    if (patchItems.length === 0) {
      console.log(`[ORDER] KG-only: cancelling server order ${existing.id} (no integer items to sync)`)
      try {
        await updateServerOrderStatus(existing.id, 'CANCELED')
      } catch (cancelErr: any) {
        // Server allaqachon yopilgan bo'lishi mumkin — e'tibor bermay davom etamiz
        console.warn(`[ORDER] KG-only cancel failed (${existing.id}): ${cancelErr?.message}`)
      }
      if (localOrderId) markOrderSynced(localOrderId, existing.id)
      return { serverId: existing.id }
    }

    // Mavjud orderni yangilash — sync-items endpointi (faqat butun sonli itemlar)
    try {
      await api.patch(`/api/order/sync-items/${existing.id}`, {
        items: patchItems.map((it) => ({ productId: it.productServerId, count: it.count }))
      })
      console.log(`[ORDER] Updated existing order ${existing.id} with ${patchItems.length} items`)
      if (localOrderId) markOrderSynced(localOrderId, existing.id)
    } catch (e: any) {
      const patchStatus = e?.response?.status
      const patchData = e?.response?.data
      console.warn(`[ORDER] sync-items xato (${patchStatus}):`, JSON.stringify(patchData ?? e?.message))

      if (patchStatus === 404) {
        // Order serverda yo'q — yangi yaratishga o'tamiz
        existing = null
      } else if (patchStatus === 400) {
        // 400 — nofaol mahsulot yoki boshqa server xato
        tgWarn(`sync-items PATCH 400 (order ${existing.id})`, e, {
          'Server order_id': existing.id,
          'Yuborilgan itemlar': patchItems.map(i => `${i.productServerId.slice(-6)}×${i.count}`).join(', ')
        })
        // patchItems allaqachon integer filterlangan — qayta urinib ko'ramiz
        try {
          await api.patch(`/api/order/sync-items/${existing.id}`, {
            items: patchItems.map((it) => ({ productId: it.productServerId, count: it.count }))
          })
          console.log(`[ORDER] sync-items retry OK for order ${existing.id}`)
          if (localOrderId) markOrderSynced(localOrderId, existing.id)
        } catch (retryErr: any) {
          tgError(`sync-items PATCH retry xato (order ${existing.id})`, retryErr, {
            'Server order_id': existing.id,
            'Itemlar': patchItems.map(i => `${i.productServerId.slice(-6)}×${i.count}`).join(', ')
          })
          if (localOrderId) markOrderSynced(localOrderId, existing.id)
        }
      } else {
        // Boshqa xato — synced deb belgilaymiz (cheksiz retry oldini olish)
        tgError(`sync-items PATCH ${patchStatus} xato (order ${existing.id})`, e, {
          'Server order_id': existing.id
        })
        if (localOrderId) markOrderSynced(localOrderId, existing.id)
      }
    }
    if (existing) return { serverId: existing.id }
  }

  // Server faqat butun sonlarni qabul qiladi — POST uchun ham filtr
  const postItems = patchItems  // patchItems = activeItems.filter(Number.isInteger)
  if (postItems.length === 0) {
    // Faqat KG fractional itemlar bor — server qabul qilmaydi, lokal saqlangan
    if (localOrderId) markOrderSynced(localOrderId)
    return { serverId: '' }
  }

  // Yangi order yaratish
  let waiterId: string | null = null
  try {
    const payload = JSON.parse(Buffer.from(s.apiToken.split('.')[1], 'base64').toString())
    waiterId = payload.id ?? payload.userId ?? null
  } catch {}

  // branchId HECH QACHON yuborilmaydi — server "property branchId should not exist" deydi
  const body: Record<string, any> = {
    roomId: roomServerId,
    orderItems: postItems.map((it) => ({ productId: it.productServerId, count: it.count }))
  }
  if (waiterId) body.waiterId = waiterId

  console.log('[ORDER] POST /api/order body:', JSON.stringify(body))
  try {
    const createRes = await api.post('/api/order', body)
    const newId = createRes.data?.id ?? createRes.data?.serverId
    if (!newId) throw new Error('Server order ID qaytarmadi')
    console.log('[ORDER] Created order:', newId)
    if (localOrderId) markOrderSynced(localOrderId, String(newId))
    return { serverId: String(newId) }
  } catch (e: any) {
    const errData = e?.response?.data
    const status = e?.response?.status
    console.error('[ORDER] POST /api/order xato:', JSON.stringify(errData ?? e?.message))

    // 403 "Bu honada odam bor yoki xona band" — fresh fetch bilan topib patch qilamiz
    if (status === 403) {
      console.warn('[ORDER] 403 — fresh fetch bilan xonadagi aktiv orderni topamiz...')
      try {
        const freshOrders = await fetchVisibleOrders()
        const found = freshOrders.find((o: any) =>
          (o.room?.id === roomServerId || o.roomId === roomServerId) && isActive(o)
        )
        if (found) {
          try {
            await api.patch(`/api/order/sync-items/${found.id}`, {
              items: postItems.map((it) => ({ productId: it.productServerId, count: it.count }))
            })
            console.log('[ORDER] 403 recovery OK — patched order:', found.id)
            if (localOrderId) markOrderSynced(localOrderId, String(found.id))
            return { serverId: String(found.id) }
          } catch (patchErr: any) {
            tgWarn(`POST 403 recovery patch xato (order ${found.id})`, patchErr, {
              'Server order_id': String(found.id),
              'Xona server_id': roomServerId,
              'Itemlar': postItems.map(i => `${i.productServerId.slice(-6)}×${i.count}`).join(', ')
            })
            if (localOrderId) markOrderSynced(localOrderId, String(found.id))
            return { serverId: String(found.id) }
          }
        }
      } catch (fetchErr: any) {
        tgWarn('POST 403 recovery fresh fetch xato', fetchErr, { 'Xona server_id': roomServerId })
      }
      // Server topilmasa ham — lokal synced deb belgilaymiz (qayta-qayta retry bo'lmasin)
      if (localOrderId) {
        const db = getDb()
        db.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(Date.now(), localOrderId)
      }
      return { serverId: '' }
    }

    // 404 — mahsulotlar nofaol, synced deb belgilaymiz
    if (status === 404) {
      tgWarn(`POST /api/order 404 (nofaol mahsulotlar)`, e, {
        'Xona server_id': roomServerId,
        'Itemlar': postItems.map(i => `${i.productServerId.slice(-6)}×${i.count}`).join(', ')
      })
      if (localOrderId) {
        const db = getDb()
        db.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(Date.now(), localOrderId)
      }
      return { serverId: '' }
    }

    tgError(`POST /api/order xato (${status})`, e, {
      'Xona server_id': roomServerId,
      'Waiter ID': waiterId ?? 'yo\'q',
      'Itemlar soni': String(postItems.length),
      'Itemlar': postItems.map(i => `${i.productServerId.slice(-6)}×${i.count}`).join(', ')
    })
    throw new Error(`Order yaratishda xato (${status ?? e?.code}): "${JSON.stringify(errData?.message ?? errData ?? e?.message)}"`)
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
    markOrderPending(orderId, ts)
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

  // UPSERT: yangi bo'lsa INSERT, mavjud bo'lsa miqdor va eslatmani yangilash
  const upsert = db.prepare(
    `INSERT INTO order_items (local_uuid, order_id, product_id, product_name, unit_price, quantity, notes, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
     ON CONFLICT(local_uuid) DO UPDATE SET
       quantity    = excluded.quantity,
       notes       = excluded.notes,
       unit_price  = excluded.unit_price,
       sync_status = 'pending',
       updated_at  = excluded.updated_at`
  )

  const tx = db.transaction(() => {
    for (const it of items) {
      upsert.run(
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
      const row = db.prepare(`SELECT * FROM order_items WHERE local_uuid = ?`).get(it.localUuid) as any
      if (row) inserted.push(mapOrderItem(row))
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

export function closeOrder(orderId: number, printedAt: number | null = now()): Order {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error('Buyurtma ID noto\'g\'ri')
  }
  const db = getDb()
  const ts = now()
  db.prepare(
    `UPDATE orders SET status = 'closed', closed_at = ?, printed_at = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`
  ).run(ts, printedAt, ts, orderId)
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any
  if (!row) throw new Error('Buyurtma topilmadi')
  return mapOrder(row)
}

export function cancelOrder(orderId: number): Order {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error('Buyurtma ID noto\'g\'ri')
  }
  const db = getDb()
  const ts = now()
  db.prepare(
    `UPDATE orders SET status = 'cancelled', closed_at = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`
  ).run(ts, ts, orderId)
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
