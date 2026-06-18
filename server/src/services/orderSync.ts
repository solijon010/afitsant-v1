/**
 * Server-side order sync logic — remote API bilan sinxronlash.
 * electron/main/services/orders.ts dan mустaqил (electron dep yo'q).
 */
import { getDb } from '../db/connection'
import { getSettings } from './settings'
import { getRemoteApi, fetchVisibleOrders, updateRemoteOrderStatus } from './remoteApi'

const now = () => Date.now()

const CLOSED_STATUSES = new Set(['CANCELED', 'CANCELLED', 'SUCCESS', 'COMPLETED', 'CLOSED', 'DONE', 'FINISHED'])
const isActive = (o: any) => !CLOSED_STATUSES.has((o.status ?? '').toUpperCase())

function markOrderSynced(localOrderId: number, serverOrderId?: string): void {
  const db = getDb()
  const ts = now()
  try {
    db.transaction(() => {
      if (serverOrderId) {
        const conflict = db.prepare('SELECT id FROM orders WHERE server_id = ? AND id != ?').get(serverOrderId, localOrderId) as any
        if (conflict) {
          db.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(ts, localOrderId)
        } else {
          db.prepare(`UPDATE orders SET server_id = COALESCE(?, server_id), sync_status = 'synced', updated_at = ? WHERE id = ?`).run(serverOrderId, ts, localOrderId)
        }
      } else {
        db.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(ts, localOrderId)
      }
      db.prepare(`UPDATE order_items SET sync_status = 'synced', updated_at = ? WHERE order_id = ?`).run(ts, localOrderId)
    })()
  } catch {
    try { db.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(ts, localOrderId) } catch {}
  }
}

export async function syncAllItems(input: {
  localOrderId?: number
  roomServerId: string
  items: Array<{ productServerId: string; count: number }>
}): Promise<{ serverId: string }> {
  const s = getSettings()
  if (!s.apiToken) throw new Error('API token yo\'q')

  const { localOrderId, roomServerId, items } = input
  const api = getRemoteApi()

  const activeItems = items.filter((it) => it.count > 0)
  // Server faqat butun sonlarni qabul qiladi
  const patchItems = activeItems.filter((it) => Number.isInteger(it.count))

  let allOrders: any[] = []
  let existing: any = null
  try {
    allOrders = await fetchVisibleOrders(500)
    existing = allOrders.find((o: any) =>
      (o.room?.id === roomServerId || o.roomId === roomServerId) && isActive(o)
    ) ?? null
  } catch (e: any) {
    console.warn('[ORDER SYNC] fetchVisibleOrders xato:', e?.message)
  }

  if (existing) {
    if (activeItems.length === 0) {
      await updateRemoteOrderStatus(existing.id, 'CANCELED')
      if (localOrderId) markOrderSynced(localOrderId, existing.id)
      return { serverId: existing.id }
    }

    if (patchItems.length === 0) {
      try { await updateRemoteOrderStatus(existing.id, 'CANCELED') } catch {}
      if (localOrderId) markOrderSynced(localOrderId, existing.id)
      return { serverId: existing.id }
    }

    try {
      await api.patch(`/api/order/sync-items/${existing.id}`, {
        items: patchItems.map((it) => ({ productId: it.productServerId, count: it.count }))
      })
      if (localOrderId) markOrderSynced(localOrderId, existing.id)
      return { serverId: existing.id }
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 404) {
        existing = null
      } else {
        if (localOrderId) markOrderSynced(localOrderId, existing.id)
        if (status !== 400) throw e
        // 400 — retry once
        try {
          await api.patch(`/api/order/sync-items/${existing.id}`, {
            items: patchItems.map((it) => ({ productId: it.productServerId, count: it.count }))
          })
          if (localOrderId) markOrderSynced(localOrderId, existing.id)
        } catch {}
        return { serverId: existing.id }
      }
    }
    if (existing) return { serverId: existing.id }
  }

  if (patchItems.length === 0) {
    if (localOrderId) markOrderSynced(localOrderId)
    return { serverId: '' }
  }

  // Yangi order yaratish
  let waiterId: string | null = null
  try {
    const payload = JSON.parse(Buffer.from(s.apiToken.split('.')[1], 'base64').toString())
    waiterId = payload.id ?? payload.userId ?? null
  } catch {}

  const body: Record<string, any> = {
    roomId: roomServerId,
    orderItems: patchItems.map((it) => ({ productId: it.productServerId, count: it.count }))
  }
  if (waiterId) body.waiterId = waiterId

  try {
    const res = await api.post('/api/order', body)
    const newId = res.data?.id ?? res.data?.serverId
    if (!newId) throw new Error('Server order ID qaytarmadi')
    if (localOrderId) markOrderSynced(localOrderId, String(newId))
    return { serverId: String(newId) }
  } catch (e: any) {
    const status = e?.response?.status
    if (status === 403) {
      const freshOrders = await fetchVisibleOrders(500)
      const found = freshOrders.find((o: any) =>
        (o.room?.id === roomServerId || o.roomId === roomServerId) && isActive(o)
      )
      if (found) {
        try {
          await api.patch(`/api/order/sync-items/${found.id}`, {
            items: patchItems.map((it) => ({ productId: it.productServerId, count: it.count }))
          })
        } catch {}
        if (localOrderId) markOrderSynced(localOrderId, String(found.id))
        return { serverId: String(found.id) }
      }
      if (localOrderId) {
        getDb().prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(now(), localOrderId)
      }
      return { serverId: '' }
    }
    throw e
  }
}
