import { getDb } from '../db/connection'
import { mapArea, mapOrder, mapOrderItem, mapTable } from '../db/mappers'
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

export function snapshot(): TableWithOrder[] {
  const tables = listTables()
  return tables.map((t) => ({ table: t, order: getOpenOrderByTable(t.id) }))
}
