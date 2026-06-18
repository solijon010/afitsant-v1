import { BrowserWindow } from 'electron'
import { io, Socket } from 'socket.io-client'
import { getApi } from './apiClient'
import { getSettings } from './settings'
import { getDb } from '../db/connection'
import { dequeueBatch, markDone, markFailed, queuedCount } from './syncQueue'
import { syncWaitersForBranch } from './auth'
import { applyProductCategoryOverrides } from './categoryConfig'
import { syncAllItems, closeOrderOnServer, cancelOrderOnServer } from './orders'
import { fetchVisibleOrders } from './orderApi'
import { tgError, tgWarn, tgConnectStatus, tgOfflineClose } from './telegramLogger'

let socket: Socket | null = null
let flushTimer: NodeJS.Timeout | null = null
let online = false
let lastSyncAt: number | null = null
let lastFullPullAt: number | null = null
let mainWindowGetter: (() => BrowserWindow | null) | null = null
let syncingPendingOrders = false

const BATCH = 25
const TICK_MS = 15_000
const FULL_PULL_INTERVAL = 5 * 60_000  // har 5 daqiqada
const MAX_BACKOFF = 60_000 * 5

export function startSync(getMainWindow: () => BrowserWindow | null): void {
  mainWindowGetter = getMainWindow
  setupSocket(getMainWindow)
  startTicker()
}

export function restartSync(): void {
  if (!mainWindowGetter) return
  online = false
  setupSocket(mainWindowGetter)
  broadcastStatus(mainWindowGetter)
}

function setupSocket(getMainWindow: () => BrowserWindow | null): void {
  const s = getSettings()
  if (!s.serverWsUrl) return
  if (socket) {
    // disconnect eventini oldini olish — biz qo'lda yopmoqdamiz
    socket.removeAllListeners()
    socket.disconnect()
  }

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
    tgConnectStatus(true)
    setTimeout(() => {
      void syncPendingOrders().catch((e: any) => console.warn('[SYNC] syncPendingOrders on connect error:', e?.message))
    }, 2000)
  })

  socket.on('disconnect', () => {
    online = false
    broadcastStatus(getMainWindow)
    tgConnectStatus(false)
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
      if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
      win.webContents.send('event:sync', { channel, data })
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
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send('event:syncStatus', {
    online,
    queued: queuedCount(),
    lastSyncAt
  })
}

export async function flush(): Promise<{ ok: boolean; flushed: number }> {
  const items = dequeueBatch(BATCH)
  let flushed = 0

  if (items.length > 0) {
    const api = getApi()
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
  }

  // Har doim pending buyurtmalarni urinib ko'ramiz — socket bilan bog'liq emas
  void syncPendingOrders().catch((e: any) => console.warn('[SYNC] syncPendingOrders in flush error:', e?.message))

  // Har 5 daqiqada bir fullPull — mahsulot narxlari va menyu yangi bo'lsin
  const now = Date.now()
  if (online && (!lastFullPullAt || now - lastFullPullAt > FULL_PULL_INTERVAL)) {
    lastFullPullAt = now
    void fullPull().catch((e: any) => console.warn('[SYNC] periodic fullPull error:', e?.message))
  }

  return { ok: true, flushed }
}

async function syncPendingOrders(): Promise<void> {
  if (syncingPendingOrders) return
  const s = getSettings()
  if (!s.apiToken) return

  syncingPendingOrders = true
  try {
    const db = getDb()

    // 1. Pending ochiq buyurtmalar — server bilan sinxronlaymiz
    const pendingOpen = db.prepare(`
      SELECT o.id, t.server_id AS room_server_id
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      WHERE o.sync_status = 'pending' AND o.status = 'open' AND t.server_id IS NOT NULL
    `).all() as Array<{ id: number; room_server_id: string }>

    for (const order of pendingOpen) {
      const items = db.prepare(`
        SELECT oi.quantity, p.server_id AS product_server_id
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `).all(order.id) as Array<{ quantity: number; product_server_id: string | null }>

      const syncItems = items
        .filter((it) => it.product_server_id && it.quantity > 0 && Number.isInteger(it.quantity))
        .map((it) => ({ productServerId: it.product_server_id!, count: it.quantity }))

      if (syncItems.length === 0) continue
      try {
        await syncAllItems({ localOrderId: order.id, roomServerId: order.room_server_id, items: syncItems })
        console.log(`[SYNC] Pending open order ${order.id} synced to server`)
      } catch (e: any) {
        console.warn(`[SYNC] Pending open order ${order.id} failed: ${e?.message}`)
        tgWarn(`Ochiq buyurtma sinxron #${order.id}`, e, {
          'Buyurtma ID': String(order.id),
          'Xona server_id': order.room_server_id,
          'Mahsulotlar soni': String(syncItems.length),
          'Mahsulotlar': syncItems.map(i => `${i.productServerId.slice(-6)}×${i.count}`).join(', ')
        })
      }
    }

    // 2. Pending yopilgan/bekor qilingan buyurtmalar — serverni xabardor qilamiz
    const pendingClosed = db.prepare(`
      SELECT o.id, o.status, o.server_id, t.server_id AS room_server_id
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      WHERE o.sync_status = 'pending' AND o.status IN ('closed', 'cancelled')
    `).all() as Array<{ id: number; status: string; server_id: string | null; room_server_id: string | null }>

    const api = getApi()

    for (const order of pendingClosed) {
      try {
        let serverId = order.server_id

        // Buyurtma mahsulotlari (offline qo'shilgan itemlar ham)
        const items = db.prepare(`
          SELECT oi.quantity, p.server_id AS product_server_id
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          WHERE oi.order_id = ?
        `).all(order.id) as Array<{ quantity: number; product_server_id: string | null }>

        const syncItems = items
          .filter((it) => it.product_server_id && it.quantity > 0 && Number.isInteger(it.quantity))
          .map((it) => ({ productId: it.product_server_id!, count: it.quantity }))

        const CLOSED_STATUSES = ['CANCELED', 'CANCELLED', 'SUCCESS', 'COMPLETED', 'CLOSED', 'DONE', 'FINISHED']

        if (!serverId && order.room_server_id) {
          // Server ID yo'q — avval items sync qilib server ID olamiz
          if (syncItems.length > 0) {
            try {
              const res = await syncAllItems({
                localOrderId: order.id,
                roomServerId: order.room_server_id,
                items: syncItems.map((it) => ({ productServerId: it.productId, count: it.count }))
              })
              serverId = res.serverId || null  // bo'sh string → null
            } catch (e: any) {
              const httpStatus = e?.response?.status ?? 0
              if (httpStatus >= 400 && httpStatus < 500) {
                // 4xx — server qayta ishlamaydi, synced deb belgilaymiz
                console.warn(`[SYNC] syncAllItems ${httpStatus} for order ${order.id} — marking synced`)
                db.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(Date.now(), order.id)
                continue
              }
              throw e  // 5xx — keyingi tickda qayta urinish
            }
          }
          // Server ID hali ham yo'q (faqat KG items yoki nofaol mahsulotlar) —
          // xonadagi mavjud OPEN orderni topib yopamiz (700k double-count oldini olish)
          if (!serverId) {
            try {
              const allOrders = await fetchVisibleOrders(500)
              const found = allOrders.find((o: any) =>
                (o.room?.id === order.room_server_id || o.roomId === order.room_server_id) &&
                !CLOSED_STATUSES.includes((o.status ?? '').toUpperCase())
              )
              if (found) {
                serverId = String(found.id)
                console.log(`[SYNC] Found open server order for room ${order.room_server_id}: ${serverId}`)
              }
            } catch (fetchErr: any) {
              console.warn(`[SYNC] Order ${order.id} — fetch for close failed: ${fetchErr?.message}`)
            }
          }
          if (!serverId) {
            db.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(Date.now(), order.id)
            console.log(`[SYNC] Order ${order.id} — no serverId, marked synced locally`)
            continue
          }
        } else if (serverId && syncItems.length > 0) {
          // Server ID bor — offline qo'shilgan itemlarni yuboramiz (final state)
          try {
            await api.patch(`/api/order/sync-items/${serverId}`, { items: syncItems })
          } catch (e: any) {
            const httpStatus = e?.response?.status ?? 0
            if (httpStatus >= 400 && httpStatus < 500) {
              tgWarn(`Pre-close PATCH ${httpStatus} (order ${order.id})`, e, {
                'Buyurtma ID': String(order.id),
                'Server order_id': serverId,
                'Status': order.status
              })
            } else {
              tgError(`Pre-close PATCH network xato (order ${order.id})`, e, {
                'Buyurtma ID': String(order.id),
                'Server order_id': serverId
              })
            }
          }
        }

        if (serverId) {
          try {
            if (order.status === 'closed') {
              await closeOrderOnServer(serverId)
            } else {
              await cancelOrderOnServer(serverId)
            }
          } catch (e: any) {
            const httpStatus = (e as any)?.response?.status
            if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
              console.log(`[SYNC] Order ${order.id} server ${httpStatus} → already processed, marking synced`)
            } else {
              throw e  // 5xx yoki network xato → keyingi tickda qayta urinsim
            }
          }
          // UNIQUE constraint oldini olish — boshqa order shu server_id ni egallab turadimi?
          const db2 = getDb()
          const conflict = db2.prepare(`SELECT id FROM orders WHERE server_id = ? AND id != ?`).get(serverId, order.id) as any
          if (conflict) {
            db2.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`).run(Date.now(), order.id)
          } else {
            db2.prepare(`UPDATE orders SET sync_status = 'synced', server_id = COALESCE(?, server_id), updated_at = ? WHERE id = ?`)
              .run(serverId, Date.now(), order.id)
          }
          console.log(`[SYNC] Pending ${order.status} order ${order.id} closed on server`)
        } else {
          // server_id ham yo'q, room_server_id ham yo'q — lokal only
          if (!order.room_server_id) {
            db.prepare(`UPDATE orders SET sync_status = 'synced', updated_at = ? WHERE id = ?`)
              .run(Date.now(), order.id)
            console.log(`[SYNC] Order ${order.id} has no server mapping — marked synced locally`)
          }
        }
      } catch (e: any) {
        console.warn(`[SYNC] Pending closed order ${order.id} failed: ${e?.message}`)
        tgError(`Yopilgan buyurtma sinxron #${order.id}`, e, {
          'Buyurtma ID': String(order.id),
          'Status': order.status,
          'Server order_id': order.server_id ?? 'yo\'q',
          'Xona server_id': order.room_server_id ?? 'yo\'q'
        })
      }
    }
  } finally {
    syncingPendingOrders = false
  }
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

  // branchId bilan so'rov 403/404 bersa, branchId siz fallback qilamiz
  async function fetchWithFallback(urlWithBranch: string | null, urlWithout: string): Promise<any> {
    if (urlWithBranch) {
      try {
        const res = await api.get(urlWithBranch)
        console.log(`[SYNC] ${urlWithBranch} → OK (${toArray(res.data).length} ta)`)
        return res
      } catch (e: any) {
        console.warn(`[SYNC] ${urlWithBranch} xato (${e?.response?.status ?? e?.code}) — fallback: ${urlWithout}`)
      }
    }
    const res = await api.get(urlWithout)
    console.log(`[SYNC] ${urlWithout} → OK (${toArray(res.data).length} ta)`)
    return res
  }

  try {
    // Barcha ma'lumotlarni BITTA parallel to'plamda olamiz — DB dan oldin!
    // Bu DELETE→fetch→insert zanjirida products yo'qolishini oldini oladi
    const [catsRes, roomCatsRes, prodsRes, roomsRes] = await Promise.allSettled([
      fetchWithFallback(branchId ? `/api/category/all/${branchId}` : null, `/api/category/all`),
      fetchWithFallback(branchId ? `/api/room-category/all/${branchId}` : null, `/api/room-category/all`),
      fetchWithFallback(
        branchId ? `/api/product/all/${branchId}?page=1&limit=2000` : null,
        `/api/product/all?page=1&limit=2000`
      ),
      fetchWithFallback(branchId ? `/api/room/all/${branchId}` : null, `/api/room/all`)
    ])

    let areaCount = 0
    let tableCount = 0
    let categoryCount = 0
    let productCount = 0

    // Kategoriyalarni UPSERT — DELETE YO'Q, products CASCADE yo'qolmaydi
    if (catsRes.status === 'fulfilled') {
      const cats = toArray(catsRes.value.data)
      console.log(`[SYNC] categories raw count: ${cats.length}`)
      const upsertCat = db.prepare(
        `INSERT INTO categories (server_id, name_uz_latn, name_uz_cyrl, icon, color, sort_order, is_active)
         VALUES (?, ?, NULL, NULL, NULL, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET
           name_uz_latn = excluded.name_uz_latn,
           sort_order   = excluded.sort_order,
           is_active    = excluded.is_active`
      )
      // Deaktivatsiya va upsert BITTA transaksiyada — agar xato chiqsa rollback bo'ladi
      db.transaction(() => {
        db.prepare(`UPDATE categories SET is_active = 0`).run()
        const seenIds = new Set<string>()
        const seenNames = new Set<string>()
        for (let i = 0; i < cats.length; i++) {
          const c = cats[i]
          if (!c.name) continue
          const idKey = String(c.id ?? '')
          const nameKey = String(c.name).toLowerCase().trim()
          if (idKey && seenIds.has(idKey)) continue
          if (seenNames.has(nameKey)) continue
          if (idKey) seenIds.add(idKey)
          seenNames.add(nameKey)
          const st = (c.status ?? '').toUpperCase()
          const isActive = (!st || st === 'ACTIVE') ? 1 : 0
          upsertCat.run(c.id ?? null, c.name, i, isActive)
          if (isActive) categoryCount++
        }
      })()
      console.log(`[SYNC] categories saved: ${categoryCount}`)
    }

    // Xona kategoriyalari (areas) — UPSERT, PK saqlanadi → tables yo'qolmaydi
    if (roomCatsRes.status === 'fulfilled') {
      const roomCats = toArray(roomCatsRes.value.data)
      console.log(`[SYNC] room-categories raw count: ${roomCats.length}`)
      if (roomCats.length > 0) {
        console.log(`[SYNC] room-categories[0]:`, JSON.stringify({ id: roomCats[0].id, name: roomCats[0].name, status: roomCats[0].status }))
      }
      const upsertArea = db.prepare(
        `INSERT INTO areas (server_id, name, type, icon, color, sort_order)
         VALUES (?, ?, 'xona', NULL, NULL, ?)
         ON CONFLICT(server_id) DO UPDATE SET
           name       = excluded.name,
           sort_order = excluded.sort_order`
      )
      db.transaction(() => {
        const seenIds = new Set<string>()
        const seenNames = new Set<string>()
        for (let i = 0; i < roomCats.length; i++) {
          const rc = roomCats[i]
          if (!rc.name) continue
          const st = (rc.status ?? '').toUpperCase()
          if (st && st !== 'ACTIVE' && st !== 'PUBLISHED' && st !== 'ENABLED') continue
          const idKey = String(rc.id ?? '')
          const nameKey = String(rc.name).toLowerCase().trim()
          if (idKey && seenIds.has(idKey)) continue
          if (seenNames.has(nameKey)) continue
          if (idKey) seenIds.add(idKey)
          seenNames.add(nameKey)
          upsertArea.run(rc.id ?? null, rc.name, i)
          areaCount++
        }
      })()
      console.log(`[SYNC] areas saved: ${areaCount}`)
    }

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
      // Birinchi xona strukturasini loglaymiz — diagnostika uchun
      if (rooms.length > 0) {
        const sample = rooms[0]
        console.log(`[SYNC] rooms[0] keys:`, Object.keys(sample))
        console.log(`[SYNC] rooms[0] sample:`, JSON.stringify({
          id: sample.id,
          name: sample.name,
          status: sample.status,
          roomCategoryId: sample.roomCategoryId,
          roomCategory: sample.roomCategory ? { id: sample.roomCategory.id } : undefined,
          categoryId: sample.categoryId
        }))
      }

      const upsertTable = db.prepare(
        `INSERT INTO tables (server_id, area_id, name, capacity, sort_order)
         SELECT ?, areas.id, ?, NULL, ?
         FROM areas WHERE areas.server_id = ?
         ON CONFLICT(server_id) DO UPDATE SET
           name = excluded.name,
           sort_order = excluded.sort_order,
           area_id = excluded.area_id`
      )
      const activeRoomServerIds: string[] = []
      db.transaction(() => {
        for (let i = 0; i < rooms.length; i++) {
          const r = rooms[i]
          // Status filter — ACTIVE yoki belgilanmagan (null/undefined) xonalarni qabul qilamiz
          const st = (r.status ?? '').toUpperCase()
          if (st && st !== 'ACTIVE' && st !== 'PUBLISHED' && st !== 'ENABLED') continue
          // Category ID ni bir necha field nomlari orqali topamiz
          const catId = r.roomCategoryId ?? r.roomCategory?.id ?? r.categoryId ?? null
          if (!catId) {
            console.warn(`[SYNC] room skip (no categoryId): ${r.name} — fields: ${Object.keys(r).join(', ')}`)
            continue
          }
          try {
            const result = upsertTable.run(r.id, r.name, i, catId)
            if ((result.changes ?? 0) > 0 || (result as any).lastInsertRowid) {
              tableCount++
            }
            activeRoomServerIds.push(String(r.id))
          } catch (err: any) {
            console.warn(`[SYNC] room skip: ${r.name} — ${err?.message}`)
          }
        }

        // Serverda nofaol/o'chirilgan xonalarni SQLite dan ham o'chiramiz
        // Ochiq buyurtmasi bor stol o'chirilmaydi (xavfsizlik uchun)
        if (activeRoomServerIds.length > 0) {
          const ph = activeRoomServerIds.map(() => '?').join(',')
          db.prepare(`
            DELETE FROM tables
            WHERE server_id IS NOT NULL
              AND server_id NOT IN (${ph})
              AND id NOT IN (SELECT DISTINCT table_id FROM orders WHERE status = 'open')
          `).run(...activeRoomServerIds)
        }
      })()
      console.log(`[SYNC] rooms saved: ${tableCount}`)
    }

    await syncWaitersForBranch(branchId)

    // Mahsulot ko'chirish override'larini qo'lla (sync keyin ham saqlanishi kerak)
    try { applyProductCategoryOverrides() } catch (e: any) {
      console.warn('[SYNC] applyProductCategoryOverrides error:', e?.message)
    }

    console.log(`[SYNC] fullPull done — areas:${areaCount} tables:${tableCount} cats:${categoryCount} prods:${productCount}`)

    // Narxlar yangilangandan keyin ochiq buyurtmalar unit_price ni ham yangilaymiz
    if (productCount > 0) {
      try {
        db.transaction(() => {
          db.prepare(`
            UPDATE order_items
            SET unit_price = (
              SELECT p.price FROM products p WHERE p.id = order_items.product_id
            )
            WHERE EXISTS (
              SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.status = 'open'
            )
              AND EXISTS (
              SELECT 1 FROM products p WHERE p.id = order_items.product_id
            )
          `).run()
          // Ochiq buyurtmalar summalarini qayta hisoblaymiz
          const openOrders = db.prepare(`SELECT id FROM orders WHERE status = 'open'`).all() as Array<{ id: number }>
          const recalc = db.prepare(`
            UPDATE orders SET
              subtotal = (SELECT COALESCE(SUM(unit_price * quantity), 0) FROM order_items WHERE order_id = orders.id),
              total    = subtotal + service_fee,
              updated_at = ?
            WHERE id = ?
          `)
          for (const o of openOrders) recalc.run(Date.now(), o.id)
        })()
        console.log('[SYNC] Open order prices refreshed after product sync')
      } catch (e: any) {
        console.warn('[SYNC] Price refresh error:', e?.message)
      }
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
  if (socket) {
    socket.removeAllListeners()  // disconnect eventini oldini olish uchun
    socket.disconnect()
  }
  flushTimer = null
  socket = null
  online = false
  mainWindowGetter = null
}
