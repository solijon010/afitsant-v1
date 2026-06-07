import { app, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import { getDb } from './db/connection'
import * as auth from './services/auth'
import * as menu from './services/menu'
import * as tables from './services/tables'
import * as orders from './services/orders'
import * as printer from './services/printer'
import * as sync from './services/syncEngine'
import * as settings from './services/settings'
import * as catConfig from './services/categoryConfig'
import * as imageCache from './services/imageCache'
import { fetchVisibleOrders } from './services/orderApi'
import { resetApi } from './services/apiClient'

export function registerIpc(): void {
  ipcMain.handle(IPC.ping, () => 'pong')

  ipcMain.handle(IPC.authLoginServer, (_e, identifier: string, password: string) =>
    auth.loginWithServer(identifier, password)
  )
  ipcMain.handle(IPC.authSelectBranch, (_e, branchId: string, branchName: string) =>
    auth.selectBranch(branchId, branchName)
  )
  ipcMain.handle(IPC.authListWaiters, () => auth.listWaiters())
  ipcMain.handle(IPC.authVerifyPin, (_e, waiterId: number, pin: string) => auth.verifyPin(waiterId, pin))
  ipcMain.handle(IPC.authSetPin, (_e, waiterId: number, pin: string) => auth.setWaiterPin(waiterId, pin))
  ipcMain.handle(IPC.authLogout, () => {
    settings.setSettings({ apiToken: null, branchId: null })
    resetApi()
    sync.restartSync()
    imageCache.clearDiskImageCache()
  })

  ipcMain.handle(IPC.menuGetCategories, () => menu.getCategories())
  ipcMain.handle(IPC.menuGetProducts, (_e, categoryId?: number) => menu.getProducts(categoryId))
  ipcMain.handle(IPC.menuGetSnapshot, () => menu.getSnapshot())

  ipcMain.handle(IPC.areasList, () => tables.listAreas())
  ipcMain.handle(IPC.tablesList, () => tables.listTables())
  ipcMain.handle(IPC.tablesSnapshot, () => tables.snapshot())
  ipcMain.handle(IPC.ordersGetByTable, (_e, tableId: number) => tables.getOpenOrderByTable(tableId))
  ipcMain.handle(IPC.ordersGetByRoom, (_e, roomServerId: string) => orders.getOrderByRoom(roomServerId))

  ipcMain.handle(IPC.ordersUpsert, (_e, input) => orders.upsertOpenOrder(input))
  ipcMain.handle(IPC.ordersAddItems, (_e, orderId: number, items: any[]) => orders.addItems(orderId, items))
  ipcMain.handle(IPC.ordersReplaceItems, (_e, orderId: number, items: any[]) => orders.replaceOrderItems(orderId, items))
  ipcMain.handle(IPC.ordersUpdateItem, (_e, itemId: number, patch: any) => orders.updateItem(itemId, patch))
  ipcMain.handle(IPC.ordersRemoveItem, (_e, itemId: number) => orders.removeItem(itemId))
  ipcMain.handle(IPC.ordersSyncAll, (_e, input: any) => orders.syncAllItems(input))
  ipcMain.handle(IPC.ordersClose, async (_e, orderId: number, serverOrderId?: string) => {
    if (serverOrderId) {
      try {
        await orders.closeOrderOnServer(serverOrderId)
      } catch (e: any) {
        console.warn('[IPC] closeOrderOnServer xato (mahalliy yopiladi):', e?.message)
      }
    }
    if (orderId > 0) return orders.closeOrder(orderId)
    return null
  })
  ipcMain.handle(IPC.ordersCancel, async (_e, orderId: number, serverOrderId?: string) => {
    if (serverOrderId) {
      try {
        await orders.cancelOrderOnServer(serverOrderId)
      } catch (e: any) {
        console.warn('[IPC] cancelOrderOnServer xato (mahalliy bekor qilinadi):', e?.message)
      }
    }
    if (orderId > 0) return orders.cancelOrder(orderId)
    return null
  })

  ipcMain.handle(IPC.printReceipt, (_e, payload) => printer.printReceipt(payload))
  ipcMain.handle(IPC.printerTest, () => printer.testPrint())
  ipcMain.handle(IPC.printerListUsb, () => printer.listUsbPrinters())
  ipcMain.handle(IPC.printerFixPerms, () => printer.fixPrinterPerms())

  ipcMain.handle(IPC.syncFullPull, () => sync.fullPull())
  ipcMain.handle(IPC.syncFlush, () => sync.flush())
  ipcMain.handle(IPC.syncStatus, () => sync.status())

  ipcMain.handle(IPC.settingsGet, () => settings.getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, patch) => {
    const updated = settings.setSettings(patch)
    resetApi()
    sync.restartSync()
    return updated
  })

  ipcMain.handle(IPC.imageCacheGet, (_e, photo: string) => imageCache.getImageFromDisk(photo))
  ipcMain.handle(IPC.imageCacheSet, (_e, photo: string, dataUrl: string) => imageCache.saveImageToDisk(photo, dataUrl))
  ipcMain.handle(IPC.imageCacheClear, () => imageCache.clearDiskImageCache())

  ipcMain.handle(IPC.categoryConfigGet, () => catConfig.getCategoryConfigs())
  ipcMain.handle(IPC.categoryConfigSave, (_e, configs) => catConfig.saveCategoryConfigs(configs))
  ipcMain.handle(IPC.categoryMoveProducts, (_e, fromId: string, toId: string) =>
    catConfig.moveProductsToCategory(fromId, toId)
  )

  ipcMain.handle(IPC.diagGetInfo, () => {
    const s = settings.getSettings()
    const logPath = join(app.getPath('logs'), 'main.log')
    return {
      hasToken: !!s.apiToken,
      branchId: s.branchId,
      serverUrl: s.serverUrl,
      logPath
    }
  })

  ipcMain.handle(IPC.diagTestWaiters, async () => {
    const { getApi } = await import('./services/apiClient')
    const s = settings.getSettings()
    const api = getApi()
    const b = s.branchId
    const endpoints = [
      ...(b ? [`/api/user/my/${b}`, `/api/user/waiter/info/${b}`, `/api/user/waiters/finance/${b}`] : []),
      '/api/user/waiters'
    ]
    const blocked: Array<{ url: string; status: number | string }> = []

    for (const url of endpoints) {
      try {
        const res = await api.get(url)
        const data = res.data as any
        const list: any[] = Array.isArray(data) ? data : (data?.data ?? [])
        return {
          branchId: b,
          serverUrl: s.serverUrl,
          chosenUrl: url,
          count: list.length,
          users: list
            .slice(0, 5)
            .map((u: any) => `${u.firstName ?? u.name ?? u.login ?? '?'} (${u.role ?? u.type ?? '?'})`),
          blocked,
          note: blocked.length > 0
            ? 'Ba’zi waiter endpointlari bu rol uchun yopiq, ishlaydigan endpoint tanlandi.'
            : 'Waiter endpoint ishladi.'
        }
      } catch (e: any) {
        blocked.push({ url, status: e?.response?.status ?? e?.message })
      }
    }

    return {
      branchId: b,
      serverUrl: s.serverUrl,
      chosenUrl: null,
      count: 0,
      users: [],
      blocked,
      note: 'Bu token waiter ro‘yxati endpointlarini ko‘ra olmaydi. App current login user bilan ishlaydi.'
    }
  })

  ipcMain.handle(IPC.diagOpenLogs, () => {
    void shell.openPath(app.getPath('logs'))
  })

  ipcMain.handle(IPC.diagRecentOrders, async () => {
    const s = settings.getSettings()
    if (!s.apiToken) return []
    try {
      const visibleOrders = await fetchVisibleOrders(200)
      return visibleOrders.slice(0, 20).map((o: any) => ({
        id: String(o.id ?? ''),
        status: String(o.status ?? ''),
        room: String(o.room?.name ?? o.room?.id ?? '-'),
        waiter: `${o.user?.firstName ?? ''} ${o.user?.lastName ?? ''}`.trim() || '-',
        total: Number(
          o.totalPrice ??
          o.total ??
          (Array.isArray(o.orderItem)
            ? o.orderItem.reduce((sum: number, item: any) => (
              sum + Number(item?.count ?? 0) * Number(item?.product?.price ?? 0)
            ), 0)
            : 0)
        ),
        itemCount: Array.isArray(o.orderItem) ? o.orderItem.length : 0,
        createdAt: String(o.createdAt ?? '')
      }))
    } catch (e: any) {
      console.error('[DIAG] recentOrders error:', e?.message)
      return []
    }
  })

  ipcMain.handle(IPC.diagDbStatus, () => {
    const db = getDb()
    const s = settings.getSettings()

    const waitersAll = db.prepare(`SELECT first_name, last_name, server_id, role FROM waiters WHERE is_active = 1`).all() as any[]
    const productsAll = db.prepare(`SELECT COUNT(*) AS total FROM products`).get() as { total: number }
    const productsWithId = db.prepare(`SELECT COUNT(*) AS c FROM products WHERE server_id IS NOT NULL AND server_id != ''`).get() as { c: number }
    const tablesAll = db.prepare(`SELECT name, server_id FROM tables`).all() as any[]

    return {
      waiters: {
        total: waitersAll.length,
        withServerId: waitersAll.filter((w: any) => w.server_id).length,
        list: waitersAll.map((w: any) => `${w.first_name} ${w.last_name ?? ''} (${w.role}) -> serverId: ${w.server_id ?? "YO'Q"}`)
      },
      products: {
        total: productsAll.total,
        withServerId: productsWithId.c
      },
      tables: {
        total: tablesAll.length,
        withServerId: tablesAll.filter((t: any) => t.server_id).length,
        list: tablesAll.map((t: any) => `${t.name} -> ${t.server_id ?? "YO'Q"}`)
      },
      token: s.apiToken ? `${s.apiToken.slice(0, 20)}...` : null,
      branchId: s.branchId
    }
  })

  ipcMain.handle(IPC.diagTestRooms, async () => {
    const { getApi } = await import('./services/apiClient')
    const s = settings.getSettings()
    const api = getApi()
    const b = s.branchId
    const testWithFallback = async (urls: string[]): Promise<{
      chosenUrl: string | null
      blocked: Array<{ url: string; status: number | string }>
      count: number
      firstItemKeys: string[]
      sample: Array<Record<string, unknown>>
    }> => {
      const blocked: Array<{ url: string; status: number | string }> = []
      for (const url of urls) {
        try {
          const res = await api.get(url)
          const data = res.data as any
          const list: any[] = Array.isArray(data) ? data : (data?.data ?? [])
          const firstItem = list[0] ?? null
          return {
            chosenUrl: url,
            blocked,
            count: list.length,
            firstItemKeys: firstItem ? Object.keys(firstItem) : [],
            sample: list.slice(0, 3).map((item: any) => ({
              id: item.id,
              name: item.name,
              status: item.status,
              roomCategoryId: item.roomCategoryId,
              roomCategory: item.roomCategory ? { id: item.roomCategory.id, name: item.roomCategory.name } : undefined,
              categoryId: item.categoryId
            }))
          }
        } catch (e: any) {
          blocked.push({ url, status: e?.response?.status ?? e?.message })
        }
      }
      return {
        chosenUrl: null,
        blocked,
        count: 0,
        firstItemKeys: [],
        sample: []
      }
    }

    const roomCategories = await testWithFallback(
      b ? [`/api/room-category/all/${b}`, '/api/room-category/all'] : ['/api/room-category/all']
    )
    const rooms = await testWithFallback(
      b ? [`/api/room/all/${b}`, '/api/room/all'] : ['/api/room/all']
    )

    return {
      branchId: b,
      serverUrl: s.serverUrl,
      roomCategories: {
        label: 'Room categories',
        ...roomCategories
      },
      rooms: {
        label: 'Rooms',
        ...rooms
      }
    }
  })

  ipcMain.handle(
    IPC.diagTestOrderCreate,
    async (_e, roomServerId: string, waiterServerId: string, productServerId: string) => {
      const { getApi } = await import('./services/apiClient')
      const s = settings.getSettings()
      if (!s.apiToken) return { ok: false, error: "Token yo'q" }
      const api = getApi()
      try {
        let realWaiterId = waiterServerId
        try {
          const payload = JSON.parse(Buffer.from(s.apiToken.split('.')[1], 'base64').toString())
          if (payload.id) realWaiterId = payload.id
        } catch {}

        const body = {
          roomId: roomServerId,
          waiterId: realWaiterId,
          orderItems: [{ productId: productServerId, count: 1 }]
        }
        console.log('[DIAG] testOrderCreate body:', JSON.stringify(body))
        const res = await api.post('/api/order', body)
        const raw = res.data as any
        return { ok: true, orderId: String(raw?.id ?? raw?.serverId ?? ''), raw }
      } catch (e: any) {
        const errData = e?.response?.data
        return { ok: false, error: `HTTP ${e?.response?.status ?? e?.code}: ${JSON.stringify(errData ?? e?.message)}` }
      }
    }
  )
}
