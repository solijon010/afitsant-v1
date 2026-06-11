import { getDb } from '../db/connection'
import { mapArea, mapOrder, mapOrderItem, mapTable } from '../db/mappers'
import { fetchVisibleOrders, isActiveServerOrder } from './orderApi'
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

export async function snapshot(): Promise<TableWithOrder[]> {
  const s = getSettings()
  const db = getDb()
  const tables = listTables()

  if (!s.apiToken || !s.branchId) {
    return tables.map((t) => ({ table: t, order: getOpenOrderByTable(t.id) }))
  }

  let activeOrders: any[] = []
  try {
    const all = await fetchVisibleOrders(200)
    activeOrders = all.filter(isActiveServerOrder)
  } catch (e: any) {
    console.error('snapshot orders fetch error:', e?.message)
  }

  const now = Date.now()

  return tables.map((table) => {
    const backendOrder = activeOrders.find((o: any) => o.room?.id === table.serverId)
    if (!backendOrder) {
      return { table, order: getOpenOrderByTable(table.id) }
    }

    // Lokal DB da bu server buyurtma allaqachon yopilgan bo'lsa —
    // server hali PENDING tursa ham stol bo'sh ko'rsatiladi.
    // syncPendingOrders() serverga ham yopilishni yuboradi.
    const localClosed = db
      .prepare(`SELECT id FROM orders WHERE table_id = ? AND status IN ('closed','cancelled') AND server_id = ? LIMIT 1`)
      .get(table.id, backendOrder.id) as any
    if (localClosed) {
      return { table, order: getOpenOrderByTable(table.id) }
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
          productServerId: it.product?.id ?? null,
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
    const pct = getSettings().serviceFeePercent ?? 0
    const serviceFee = Math.round((subtotal * pct) / 100)

    const order: OrderWithItems = {
      id: 0,
      serverId: backendOrder.id,
      localUuid: backendOrder.id,
      tableId: table.id,
      waiterId: waiter?.id ?? 0,
      status: 'open',
      subtotal,
      serviceFee,
      total: subtotal + serviceFee,
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
