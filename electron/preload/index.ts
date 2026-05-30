import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type BridgeAPI } from '@shared/ipc'

const api: BridgeAPI = {
  ping: () => ipcRenderer.invoke(IPC.ping),

  auth: {
    loginServer: (identifier, password) => ipcRenderer.invoke(IPC.authLoginServer, identifier, password),
    selectBranch: (branchId, branchName) => ipcRenderer.invoke(IPC.authSelectBranch, branchId, branchName),
    listWaiters: () => ipcRenderer.invoke(IPC.authListWaiters),
    verifyPin: (waiterId, pin) => ipcRenderer.invoke(IPC.authVerifyPin, waiterId, pin),
    setPin: (waiterId, pin) => ipcRenderer.invoke(IPC.authSetPin, waiterId, pin),
    logout: () => ipcRenderer.invoke(IPC.authLogout)
  },

  menu: {
    getCategories: () => ipcRenderer.invoke(IPC.menuGetCategories),
    getProducts: (categoryId) => ipcRenderer.invoke(IPC.menuGetProducts, categoryId),
    getSnapshot: () => ipcRenderer.invoke(IPC.menuGetSnapshot)
  },

  areas: {
    list: () => ipcRenderer.invoke(IPC.areasList)
  },

  tables: {
    list: () => ipcRenderer.invoke(IPC.tablesList),
    snapshot: () => ipcRenderer.invoke(IPC.tablesSnapshot),
    getByTable: (tableId) => ipcRenderer.invoke(IPC.ordersGetByTable, tableId)
  },

  orders: {
    getByRoom: (roomServerId) => ipcRenderer.invoke(IPC.ordersGetByRoom, roomServerId),
    upsert: (input) => ipcRenderer.invoke(IPC.ordersUpsert, input),
    syncAll: (input) => ipcRenderer.invoke(IPC.ordersSyncAll, input),
    addItems: (orderId, items) => ipcRenderer.invoke(IPC.ordersAddItems, orderId, items),
    replaceItems: (orderId, items) => ipcRenderer.invoke(IPC.ordersReplaceItems, orderId, items),
    updateItem: (itemId, patch) => ipcRenderer.invoke(IPC.ordersUpdateItem, itemId, patch),
    removeItem: (itemId) => ipcRenderer.invoke(IPC.ordersRemoveItem, itemId),
    close: (orderId, serverOrderId) => ipcRenderer.invoke(IPC.ordersClose, orderId, serverOrderId),
    cancel: (orderId, serverOrderId) => ipcRenderer.invoke(IPC.ordersCancel, orderId, serverOrderId)
  },

  printer: {
    receipt: (payload) => ipcRenderer.invoke(IPC.printReceipt, payload),
    test: () => ipcRenderer.invoke(IPC.printerTest),
    listUsb: () => ipcRenderer.invoke(IPC.printerListUsb),
    fixPerms: () => ipcRenderer.invoke(IPC.printerFixPerms)
  },

  sync: {
    fullPull: () => ipcRenderer.invoke(IPC.syncFullPull),
    flush: () => ipcRenderer.invoke(IPC.syncFlush),
    status: () => ipcRenderer.invoke(IPC.syncStatus)
  },

  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch)
  },

  category: {
    configGet: () => ipcRenderer.invoke(IPC.categoryConfigGet),
    configSave: (configs: any[]) => ipcRenderer.invoke(IPC.categoryConfigSave, configs),
    moveProducts: (fromId: string, toId: string) => ipcRenderer.invoke(IPC.categoryMoveProducts, fromId, toId)
  },

  diag: {
    getInfo: () => ipcRenderer.invoke(IPC.diagGetInfo),
    openLogs: () => ipcRenderer.invoke(IPC.diagOpenLogs),
    testWaiters: (): Promise<Record<string, any>> => ipcRenderer.invoke(IPC.diagTestWaiters),
    recentOrders: () => ipcRenderer.invoke(IPC.diagRecentOrders),
    dbStatus: () => ipcRenderer.invoke(IPC.diagDbStatus),
    testOrderCreate: (roomServerId: string, waiterServerId: string, productServerId: string) =>
      ipcRenderer.invoke(IPC.diagTestOrderCreate, roomServerId, waiterServerId, productServerId)
  },

  on: {
    sync: (cb) => {
      const handler = (_e: unknown, payload: any) => cb(payload)
      ipcRenderer.on(IPC.onSyncEvent, handler)
      return () => ipcRenderer.removeListener(IPC.onSyncEvent, handler)
    },
    syncStatus: (cb) => {
      const handler = (_e: unknown, payload: any) => cb(payload)
      ipcRenderer.on(IPC.onSyncStatus, handler)
      return () => ipcRenderer.removeListener(IPC.onSyncStatus, handler)
    },
    sessionExpired: (cb) => {
      const handler = () => cb()
      ipcRenderer.on(IPC.onSessionExpired, handler)
      return () => ipcRenderer.removeListener(IPC.onSessionExpired, handler)
    }
  },

  setLanguage: (lang) => {
    ipcRenderer.invoke(IPC.settingsSet, { language: lang })
  }
}

contextBridge.exposeInMainWorld('afisant', api)
