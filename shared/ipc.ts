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
  menuGetProducts: 'menu:getProducts',
  menuGetSnapshot: 'menu:getSnapshot',

  areasList: 'areas:list',
  tablesList: 'tables:list',
  tablesSnapshot: 'tables:snapshot',

  ordersGetByRoom: 'orders:getByRoom',
  ordersGetByTable: 'orders:getByTable',
  ordersUpsert: 'orders:upsert',
  ordersAddItems: 'orders:addItems',
  ordersRemoveItem: 'orders:removeItem',
  ordersUpdateItem: 'orders:updateItem',
  ordersSyncAll: 'orders:syncAll',
  ordersClose: 'orders:close',
  ordersCancel: 'orders:cancel',

  printReceipt: 'printer:receipt',
  printerTest: 'printer:test',
  printerListUsb: 'printer:listUsb',

  syncFullPull: 'sync:fullPull',
  syncFlush: 'sync:flush',
  syncStatus: 'sync:status',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  onSyncEvent: 'event:sync',
  onSyncStatus: 'event:syncStatus'
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
      roomServerId: string
      waiterServerId: string
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
    updateItem: (itemId: number, patch: { quantity?: number; notes?: string | null }) => Promise<OrderItem>
    removeItem: (itemId: number) => Promise<void>
    close: (orderId: number, serverOrderId?: string) => Promise<Order>
    cancel: (orderId: number, serverOrderId?: string) => Promise<Order>
  }

  printer: {
    receipt: (payload: ReceiptPayload) => Promise<{ ok: true } | { ok: false; error: string }>
    test: () => Promise<{ ok: true } | { ok: false; error: string }>
    listUsb: () => Promise<Array<{ vendorId: string; productId: string; manufacturer?: string; product?: string }>>
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

  on: {
    sync: (cb: (event: { channel: string; data: unknown }) => void) => () => void
    syncStatus: (cb: (status: { online: boolean; queued: number; lastSyncAt: number | null }) => void) => () => void
  }

  setLanguage: (lang: Lang) => void
}

declare global {
  interface Window {
    afisant: BridgeAPI
  }
}
