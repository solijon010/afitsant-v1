import type {
  Area,
  BranchInfo,
  Category,
  Lang,
  Order,
  OrderItem,
  OrderWithItems,
  Product,
  ReceiptPayload,
  ServerLoginResult,
  Settings,
  TableEntity,
  TableWithOrder,
  Waiter
} from './types'

export const IPC = {
  ping: 'app:ping',

  authLoginServer: 'auth:loginServer',
  authSelectBranch: 'auth:selectBranch',
  authListWaiters: 'auth:listWaiters',
  authVerifyPin: 'auth:verifyPin',
  authSetPin: 'auth:setPin',
  authLogout: 'auth:logout',

  menuGetCategories: 'menu:getCategories',
  menuGetAllCategories: 'menu:getAllCategories',
  menuGetProducts: 'menu:getProducts',
  menuGetSnapshot: 'menu:getSnapshot',

  areasList: 'areas:list',
  tablesList: 'tables:list',
  tablesSnapshot: 'tables:snapshot',

  ordersGetByRoom: 'orders:getByRoom',
  ordersGetByTable: 'orders:getByTable',
  ordersUpsert: 'orders:upsert',
  ordersAddItems: 'orders:addItems',
  ordersReplaceItems: 'orders:replaceItems',
  ordersRemoveItem: 'orders:removeItem',
  ordersUpdateItem: 'orders:updateItem',
  ordersSyncAll: 'orders:syncAll',
  ordersClose: 'orders:close',
  ordersCancel: 'orders:cancel',

  printReceipt: 'printer:receipt',
  printerTest: 'printer:test',
  printerListUsb: 'printer:listUsb',
  printerFixPerms: 'printer:fixPerms',

  syncFullPull: 'sync:fullPull',
  syncFlush: 'sync:flush',
  syncStatus: 'sync:status',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  categoryConfigGet: 'category:configGet',
  categoryConfigSave: 'category:configSave',
  categoryMoveProducts: 'category:moveProducts',
  categoryClearOverrides: 'category:clearOverrides',

  productSortGet: 'product:sortGet',
  productSortSave: 'product:sortSave',

  imageCacheGet: 'imageCache:get',
  imageCacheSet: 'imageCache:set',
  imageCacheClear: 'imageCache:clear',

  diagGetInfo: 'diag:getInfo',
  diagTestWaiters: 'diag:testWaiters',
  diagOpenLogs: 'diag:openLogs',
  diagRecentOrders: 'diag:recentOrders',
  diagDbStatus: 'diag:dbStatus',
  diagTestOrderCreate: 'diag:testOrderCreate',
  diagTestRooms: 'diag:testRooms',
  diagCancelAllServerOrders: 'diag:cancelAllServerOrders',
  diagClearAllServerOrders: 'diag:clearAllServerOrders',

  onSyncEvent: 'event:sync',
  onSyncStatus: 'event:syncStatus',
  onSessionExpired: 'event:sessionExpired'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface BridgeAPI {
  ping: () => Promise<'pong'>

  auth: {
    loginServer: (identifier: string, password: string) => Promise<ServerLoginResult>
    selectBranch: (branchId: string, branchName: string) => Promise<{ ok: boolean }>
    listWaiters: () => Promise<Waiter[]>
    verifyPin: (waiterId: number, pin: string) => Promise<{
      ok: boolean
      waiter?: Waiter
      lockedUntil?: number
      attemptsLeft?: number
      message?: string
    }>
    setPin: (waiterId: number, pin: string) => Promise<{ ok: boolean; message?: string }>
    logout: () => Promise<void>
  }

  menu: {
    getCategories: () => Promise<Category[]>
    getAllCategories: () => Promise<Category[]>
    getProducts: (categoryId?: number) => Promise<Product[]>
    getSnapshot: () => Promise<{ categories: Category[]; products: Product[] }>
  }

  areas: {
    list: () => Promise<Area[]>
  }

  tables: {
    list: () => Promise<TableEntity[]>
    snapshot: () => Promise<TableWithOrder[]>
    getByTable: (tableId: number) => Promise<OrderWithItems | null>
  }

  orders: {
    getByRoom: (roomServerId: string) => Promise<OrderWithItems | null>
    upsert: (input: {
      tableId: number
      waiterId: number
      serviceFeePercent: number
      notes?: string | null
    }) => Promise<Order>
    syncAll: (input: {
      localOrderId?: number
      roomServerId: string
      items: Array<{ productServerId: string; count: number }>
    }) => Promise<{ serverId: string }>
    addItems: (
      orderId: number,
      items: Array<{
        productId: number
        productName: string
        unitPrice: number
        quantity: number
        notes?: string | null
        localUuid: string
      }>
    ) => Promise<OrderItem[]>
    replaceItems: (
      orderId: number,
      items: Array<{
        productId: number
        productName: string
        unitPrice: number
        quantity: number
        notes?: string | null
        localUuid: string
      }>
    ) => Promise<OrderItem[]>
    updateItem: (itemId: number, patch: { quantity?: number; notes?: string | null }) => Promise<OrderItem>
    removeItem: (itemId: number) => Promise<void>
    close: (orderId: number, serverOrderId?: string) => Promise<Order>
    cancel: (orderId: number, serverOrderId?: string) => Promise<Order>
  }

  printer: {
    receipt: (payload: ReceiptPayload) => Promise<{ ok: true } | { ok: false; error: string }>
    test: () => Promise<{ ok: true } | { ok: false; error: string }>
    listUsb: () => Promise<Array<{
      vendorId: string
      productId: string
      manufacturer?: string
      product?: string
      online?: boolean
      statusText?: string
    }>>
    fixPerms: () => Promise<{ ok: true } | { ok: false; error: string }>
  }

  sync: {
    fullPull: () => Promise<{ ok: boolean; counts?: { categories: number; products: number; areas: number; tables: number; waiters: number } }>
    flush: () => Promise<{ ok: boolean; flushed: number }>
    status: () => Promise<{ online: boolean; queued: number; lastSyncAt: number | null }>
  }

  settings: {
    get: () => Promise<Settings>
    set: (patch: Partial<Settings>) => Promise<Settings>
  }

  category: {
    configGet: () => Promise<Array<{ serverId: string; localName: string | null; sortOrderOverride: number | null; isHidden: boolean }>>
    configSave: (configs: Array<{ serverId: string; localName: string | null; sortOrderOverride: number | null; isHidden: boolean }>) => Promise<void>
    moveProducts: (fromServerId: string, toServerId: string) => Promise<{ moved: number }>
    clearOverrides: () => Promise<void>
  }

  product: {
    sortGet: (categoryServerId: string) => Promise<Array<{ serverId: string; name: string; sortOrder: number }>>
    sortSave: (overrides: Array<{ serverId: string; sortOrder: number }>) => Promise<void>
  }

  imageCache: {
    get: (photo: string) => Promise<string | null>
    set: (photo: string, dataUrl: string) => Promise<void>
    clear: () => Promise<void>
  }

  diag: {
    getInfo: () => Promise<{ hasToken: boolean; branchId: string | null; serverUrl: string; logPath: string }>
    openLogs: () => Promise<void>
    testWaiters: () => Promise<Record<string, any>>
    recentOrders: () => Promise<Array<{
      id: string
      status: string
      room: string
      waiter: string
      total: number
      itemCount: number
      createdAt: string
    }>>
    dbStatus: () => Promise<{
      waiters: { total: number; withServerId: number; list: string[] }
      products: { total: number; withServerId: number }
      tables: { total: number; withServerId: number; list: string[] }
      hasToken: boolean
      branchId: string | null
    }>
    testOrderCreate: (roomServerId: string, waiterServerId: string, productServerId: string) => Promise<{ ok: boolean; orderId?: string; error?: string; raw?: any }>
    testRooms: () => Promise<Record<string, any>>
    cancelAllServerOrders: () => Promise<{ cancelled: number; failed: number; total: number }>
    clearAllServerOrders: () => Promise<{ cancelled: number; failed: number; total: number }>
  }

  on: {
    sync: (cb: (event: { channel: string; data: unknown }) => void) => () => void
    syncStatus: (cb: (status: { online: boolean; queued: number; lastSyncAt: number | null }) => void) => () => void
    sessionExpired: (cb: () => void) => () => void
  }

  setLanguage: (lang: Lang) => void
}

declare global {
  interface Window {
    afisant: BridgeAPI
  }
}
