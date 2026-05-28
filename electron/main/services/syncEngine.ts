import { BrowserWindow } from 'electron'
import { io, Socket } from 'socket.io-client'
import { getApi } from './apiClient'
import { getSettings } from './settings'
import { getDb } from '../db/connection'
import { dequeueBatch, markDone, markFailed, queuedCount } from './syncQueue'
import { syncWaitersForBranch } from './auth'

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
  if (!s.apiToken) return { ok: false }

  const api = getApi()
  const branchId = s.branchId
  const db = getDb()

  const toArray = (raw: any): any[] => (Array.isArray(raw) ? raw : (raw?.data ?? []))

  try {
    // 1-qadam: kategoriyalar va xona kategoriyalari (parallel)
    const [catsRes, roomCatsRes] = await Promise.allSettled([
      branchId ? api.get(`/api/category/all/${branchId}`) : api.get(`/api/category/all`),
      branchId ? api.get(`/api/room-category/all/${branchId}`) : api.get(`/api/room-category/all`)
    ])

    let areaCount = 0
    let tableCount = 0
    let categoryCount = 0
    let productCount = 0

    // Kategoriyalarni saqlash
    if (catsRes.status === 'fulfilled') {
      const cats = toArray(catsRes.value.data)
      console.log(`[SYNC] categories raw count: ${cats.length}`)
      const upsertCat = db.prepare(
        `INSERT INTO categories (server_id, name_uz_latn, name_uz_cyrl, icon, color, sort_order, is_active)
         VALUES (?, ?, NULL, NULL, NULL, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET
           name_uz_latn = excluded.name_uz_latn,
           sort_order = excluded.sort_order,
           is_active = excluded.is_active`
      )
      db.transaction(() => {
        for (let i = 0; i < cats.length; i++) {
          const c = cats[i]
          upsertCat.run(c.id, c.name, i, c.status === 'ACTIVE' ? 1 : 0)
          categoryCount++
        }
      })()
    }

    // Xona kategoriyalarini (areas) saqlash
    if (roomCatsRes.status === 'fulfilled') {
      const roomCats = toArray(roomCatsRes.value.data)
      console.log(`[SYNC] room-categories raw count: ${roomCats.length}`)
      const upsertArea = db.prepare(
        `INSERT INTO areas (server_id, name, type, icon, color, sort_order)
         VALUES (?, ?, 'xona', NULL, NULL, ?)
         ON CONFLICT(server_id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`
      )
      db.transaction(() => {
        for (let i = 0; i < roomCats.length; i++) {
          const rc = roomCats[i]
          if (rc.status !== 'ACTIVE') continue
          upsertArea.run(rc.id, rc.name, i)
          areaCount++
        }
      })()
    }

    // 2-qadam: mahsulotlar va xonalar (kategoriyalar/arealar DB'da bo'lgandan keyin)
    const [prodsRes, roomsRes] = await Promise.allSettled([
      branchId
        ? api.get(`/api/product/all/${branchId}?page=1&limit=500`)
        : api.get(`/api/product/all?page=1&limit=500`),
      branchId ? api.get(`/api/room/all/${branchId}`) : api.get(`/api/room/all`)
    ])

    // Mahsulotlarni saqlash
    if (prodsRes.status === 'fulfilled') {
      const prods = toArray(prodsRes.value.data)
      console.log(`[SYNC] products raw count: ${prods.length}`)
      const upsertProd = db.prepare(
        `INSERT INTO products (server_id, category_id, name_uz_latn, name_uz_cyrl, price, unit, image_url, emoji, is_available, stock, sort_order)
         SELECT ?, categories.id, ?, NULL, ?, ?, ?, NULL, 1, NULL, ?
         FROM categories WHERE categories.server_id = ?
         ON CONFLICT(server_id) DO UPDATE SET
           name_uz_latn = excluded.name_uz_latn,
           price = excluded.price,
           unit = excluded.unit,
           image_url = excluded.image_url,
           sort_order = excluded.sort_order,
           category_id = excluded.category_id`
      )
      db.transaction(() => {
        for (let i = 0; i < prods.length; i++) {
          const p = prods[i]
          if (p.status !== 'ACTIVE') continue
          const unit = (p.unit ?? 'DONA').toLowerCase()
          const safeUnit = ['dona', 'kg', 'porsiya', 'litr'].includes(unit) ? unit : 'dona'
          const catServerId = p.productCategoryId ?? p.categoryId ?? null
          if (!catServerId) continue
          const photoFilename: string | null = p.photo ?? null
          try {
            upsertProd.run(p.id, p.name, Math.round(Number(p.price)), safeUnit, photoFilename, i, catServerId)
            productCount++
          } catch (err: any) {
            console.warn(`[SYNC] product skip: ${p.name} — ${err?.message}`)
          }
        }
      })()
    }

    // Xonalarni (tables) saqlash
    if (roomsRes.status === 'fulfilled') {
      const rooms = toArray(roomsRes.value.data)
      console.log(`[SYNC] rooms raw count: ${rooms.length}`)
      const upsertTable = db.prepare(
        `INSERT INTO tables (server_id, area_id, name, capacity, sort_order)
         SELECT ?, areas.id, ?, NULL, ?
         FROM areas WHERE areas.server_id = ?
         ON CONFLICT(server_id) DO UPDATE SET
           name = excluded.name,
           sort_order = excluded.sort_order,
           area_id = excluded.area_id`
      )
      db.transaction(() => {
        for (let i = 0; i < rooms.length; i++) {
          const r = rooms[i]
          if (r.status !== 'ACTIVE') continue
          try {
            upsertTable.run(r.id, r.name, i, r.roomCategoryId)
            tableCount++
          } catch (err: any) {
            console.warn(`[SYNC] room skip: ${r.name} — ${err?.message}`)
          }
        }
      })()
    }

    await syncWaitersForBranch(branchId)

    console.log(`[SYNC] fullPull done — areas:${areaCount} tables:${tableCount} cats:${categoryCount} prods:${productCount}`)
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
