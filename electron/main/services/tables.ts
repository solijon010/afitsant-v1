import { getDb } from '../db/connection'
import { mapArea, mapOrder, mapOrderItem, mapTable } from '../db/mappers'
import { fetchVisibleOrders } from './orderApi'
import { getSettings } from './settings'
import type { Area, OrderWithItems, TableEntity, TableWithOrder } from '@shared/types'

export function listAreas(): Area[] {
  const rows = getDb().prepare(`SELECT * FROM areas ORDER BY sort_order, id`).all() as any[]
  return rows.map(mapArea)
}

export function listTables(): TableEntity[] {
  const rows = getDb()
    .prepare(`SELECT * FROM tables ORDER BY area_id, sort_order, id`)
    .all() as any[]
  return rows.map(mapTable)
}

export function getOpenOrderByTable(tableId: number): OrderWithItems | null {
  const db = getDb()
  const order = db
    .prepare(`SELECT * FROM orders WHERE table_id = ? AND status = 'open' LIMIT 1`)
    .get(tableId) as any
  if (!order) return null
  const items = db
    .prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id`)
    .all(order.id) as any[]
  return { ...mapOrder(order), items: items.map(mapOrderItem) }
}

/** Bu stol lokal yopilgan lekin server hali bilmaydi (pending sync) */
function hasPendingClose(tableId: number): boolean {
  const row = getDb()
    .prepare(`SELECT 1 FROM orders WHERE table_id = ? AND status IN ('closed','cancelled') AND sync_status = 'pending' LIMIT 1`)
    .get(tableId)
  return !!row
}

export async function snapshot(): Promise<TableWithOrder[]> {
  const s = getSettings()
  const db = getDb()
  const tables = listTables()

  if (!s.apiToken || !s.branchId) {
    return tables.map((t) => ({ table: t, order: getOpenOrderByTable(t.id) }))
  }

  let activeOrders: any[] = []
  try {
    const all = await fetchVisibleOrders(500)
    activeOrders = all.filter((o: any) => o.status === 'PENDING' || o.status === 'READY')
  } catch (e: any) {
    console.error('snapshot orders fetch error:', e?.message)
  }

  const now = Date.now()

  return tables.map((table) => {
    // Lokal yopilgan lekin server hali PENDING ko'rsatayotgan bo'lsa — bo'sh qaytaramiz
    // (zombie orderni oldini olish: internet kelganda server hali yopmagan)
    if (hasPendingClose(table.id)) {
      return { table, order: null }
    }

    const backendOrder = activeOrders.find((o: any) => o.room?.id === table.serverId)
    if (!backendOrder) {
      return { table, order: getOpenOrderByTable(table.id) }
    }

    // Lokal open order ustuvor — narx va miqdor SQLite da to'g'ri saqlangan
    const localOrder = getOpenOrderByTable(table.id)
    if (localOrder && localOrder.items.length > 0) {
      return { table, order: localOrder }
    }

    const waiter = backendOrder.user
      ? (db.prepare(`SELECT * FROM waiters WHERE server_id = ?`).get(backendOrder.user.id) as any)
      : null

    const items = (backendOrder.orderItem ?? [])
      .filter((it: any) => it.status !== 'CANCELED')
      .map((it: any, idx: number) => {
        const product = it.product?.id
          ? (db.prepare(`SELECT * FROM products WHERE server_id = ?`).get(it.product.id) as any)
          : null
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
          createdAt: now,
          updatedAt: now
        }
      })

    const subtotal = items.reduce((s: number, it: any) => s + it.unitPrice * it.quantity, 0)

    const order: OrderWithItems = {
      id: 0,
      serverId: backendOrder.id,
      localUuid: backendOrder.id,
      tableId: table.id,
      waiterId: waiter?.id ?? 0,
      status: 'open',
      subtotal,
      serviceFee: 0,
      total: subtotal,
      openedAt: new Date(backendOrder.createdAt).getTime(),
      closedAt: null,
      printedAt: null,
      notes: null,
      syncStatus: 'synced',
      createdAt: new Date(backendOrder.createdAt).getTime(),
      updatedAt: now,
      items
    }

    return { table, order }
  })
}
