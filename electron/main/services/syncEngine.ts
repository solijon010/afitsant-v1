import { BrowserWindow } from 'electron'
import { io, Socket } from 'socket.io-client'
import { getApi } from './apiClient'
import { getSettings } from './settings'
import { getDb } from '../db/connection'
import { dequeueBatch, markDone, markFailed, queuedCount } from './syncQueue'

let socket: Socket | null = null
let flushTimer: NodeJS.Timeout | null = null
let online = false
let lastSyncAt: number | null = null

const BATCH = 25
const TICK_MS = 15_000
const MAX_BACKOFF = 60_000 * 5

export function startSync(getMainWindow: () => BrowserWindow | null): void {
  setupSocket(getMainWindow)
  startTicker()
}

function setupSocket(getMainWindow: () => BrowserWindow | null): void {
  const s = getSettings()
  if (!s.serverWsUrl) return
  if (socket) socket.disconnect()

  socket = io(s.serverWsUrl, {
    transports: ['websocket'],
    auth: s.apiToken ? { token: s.apiToken } : undefined,
    reconnection: true,
    reconnectionDelay: 1_500,
    reconnectionDelayMax: 15_000
  })

  socket.on('connect', () => {
    online = true
    broadcastStatus(getMainWindow)
  })

  socket.on('disconnect', () => {
    online = false
    broadcastStatus(getMainWindow)
  })

  for (const channel of [
    'menu.updated',
    'category.updated',
    'product.updated',
    'waiter.updated',
    'area.updated',
    'table.updated',
    'order.updated',
    'order.closed'
  ]) {
    socket.on(channel, (data: unknown) => {
      const win = getMainWindow()
      win?.webContents.send('event:sync', { channel, data })
    })
  }
}

function startTicker(): void {
  if (flushTimer) clearInterval(flushTimer)
  flushTimer = setInterval(() => {
    void flush().catch(() => undefined)
  }, TICK_MS)
}

function broadcastStatus(getMainWindow: () => BrowserWindow | null): void {
  const win = getMainWindow()
  win?.webContents.send('event:syncStatus', {
    online,
    queued: queuedCount(),
    lastSyncAt
  })
}

export async function flush(): Promise<{ ok: boolean; flushed: number }> {
  const items = dequeueBatch(BATCH)
  if (items.length === 0) return { ok: true, flushed: 0 }

  const api = getApi()
  let flushed = 0
  const doneIds: number[] = []

  for (const item of items) {
    try {
      const path = `/api/sync/${item.entity}/${item.action}`
      await api.post(path, item.payload)
      doneIds.push(item.id)
      flushed++
    } catch (err: any) {
      const backoff = Math.min(2_000 * 2 ** item.attempts, MAX_BACKOFF)
      markFailed(item.id, err?.message ?? 'unknown', backoff)
    }
  }

  if (doneIds.length > 0) markDone(doneIds)
  lastSyncAt = Date.now()
  return { ok: true, flushed }
}

export async function fullPull(): Promise<{
  ok: boolean
  counts?: { categories: number; products: number; areas: number; tables: number; waiters: number }
}> {
  const s = getSettings()
  if (!s.apiToken || !s.branchId) return { ok: false }

  const api = getApi()
  const branchId = s.branchId
  const db = getDb()

  try {
    const [roomCatsRes, roomsRes, catsRes, prodsRes] = await Promise.allSettled([
      api.get(`/api/room-category/all/${branchId}`),
      api.get(`/api/room/all/${branchId}`),
      api.get(`/api/category/all/${branchId}`),
      api.get(`/api/product/all/${branchId}?page=1&limit=500`)
    ])

    let areaCount = 0
    let tableCount = 0
    let categoryCount = 0
    let productCount = 0

    if (roomCatsRes.status === 'fulfilled') {
      const roomCats = roomCatsRes.value.data as any[]
      const upsertArea = db.prepare(
        `INSERT INTO areas (server_id, name, type, icon, color, sort_order)
         VALUES (?, ?, 'xona', NULL, NULL, ?)
         ON CONFLICT(server_id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`
      )
      const tx = db.transaction(() => {
        for (let i = 0; i < roomCats.length; i++) {
          const rc = roomCats[i]
          if (rc.status !== 'ACTIVE') continue
          upsertArea.run(rc.id, rc.name, i)
          areaCount++
        }
      })
      tx()
    }

    if (roomsRes.status === 'fulfilled') {
      const rooms = roomsRes.value.data as any[]
      const upsertTable = db.prepare(
        `INSERT INTO tables (server_id, area_id, name, capacity, sort_order)
         SELECT ?, areas.id, ?, NULL, ?
         FROM areas WHERE areas.server_id = ?
         ON CONFLICT(server_id) DO UPDATE SET
           name = excluded.name,
           area_id = (SELECT id FROM areas WHERE server_id = excluded.server_id)`
      )
      const tx = db.transaction(() => {
        for (let i = 0; i < rooms.length; i++) {
          const r = rooms[i]
          if (r.status !== 'ACTIVE') continue
          try {
            upsertTable.run(r.id, r.name, i, r.roomCategoryId)
            tableCount++
          } catch {}
        }
      })
      tx()
    }

    if (catsRes.status === 'fulfilled') {
      const cats = catsRes.value.data as any[]
      const upsertCat = db.prepare(
        `INSERT INTO categories (server_id, name_uz_latn, name_uz_cyrl, icon, color, sort_order, is_active)
         VALUES (?, ?, NULL, NULL, NULL, ?, 1)
         ON CONFLICT(server_id) DO UPDATE SET
           name_uz_latn = excluded.name_uz_latn,
           sort_order = excluded.sort_order,
           is_active = CASE WHEN excluded.is_active = 1 THEN 1 ELSE 0 END`
      )
      const tx = db.transaction(() => {
        for (let i = 0; i < cats.length; i++) {
          const c = cats[i]
          upsertCat.run(c.id, c.name, i, c.status === 'ACTIVE' ? 1 : 0)
          categoryCount++
        }
      })
      tx()
    }

    if (prodsRes.status === 'fulfilled') {
      const raw = prodsRes.value.data as any
      const prods: any[] = Array.isArray(raw) ? raw : (raw?.data ?? [])
      const upsertProd = db.prepare(
        `INSERT INTO products (server_id, category_id, name_uz_latn, name_uz_cyrl, price, unit, image_url, emoji, is_available, stock, sort_order)
         SELECT ?, categories.id, ?, NULL, ?, ?, ?, NULL, ?, NULL, ?
         FROM categories WHERE categories.server_id = ?
         ON CONFLICT(server_id) DO UPDATE SET
           name_uz_latn = excluded.name_uz_latn,
           price = excluded.price,
           unit = excluded.unit,
           image_url = excluded.image_url,
           is_available = excluded.is_available,
           category_id = (SELECT id FROM categories WHERE server_id = excluded.server_id)`
      )
      const tx = db.transaction(() => {
        for (let i = 0; i < prods.length; i++) {
          const p = prods[i]
          if (p.status !== 'ACTIVE') continue
          const unit = (p.unit ?? 'DONA').toLowerCase() as string
          const validUnits = ['dona', 'kg', 'porsiya', 'litr']
          const safeUnit = validUnits.includes(unit) ? unit : 'dona'
          const catServerId = p.productCategoryId ?? p.categoryId ?? null
          if (!catServerId) continue
          const photoUrl = p.photo ? `${getSettings().serverUrl}/api/image/${p.photo}` : null
          try {
            upsertProd.run(p.id, p.name, Math.round(Number(p.price)), safeUnit, photoUrl, 1, i, catServerId)
            productCount++
          } catch {}
        }
      })
      tx()
    }

    lastSyncAt = Date.now()
    return {
      ok: true,
      counts: { categories: categoryCount, products: productCount, areas: areaCount, tables: tableCount, waiters: 0 }
    }
  } catch (e: any) {
    console.error('fullPull error:', e?.message)
    return { ok: false }
  }
}

export function status(): { online: boolean; queued: number; lastSyncAt: number | null } {
  return { online, queued: queuedCount(), lastSyncAt }
}

export function stopSync(): void {
  if (flushTimer) clearInterval(flushTimer)
  if (socket) socket.disconnect()
  flushTimer = null
  socket = null
}
