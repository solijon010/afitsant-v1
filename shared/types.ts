export type Lang = 'uz-latn' | 'uz-cyrl'

export type WaiterRole = 'waiter' | 'super_waiter' | 'manager'
export type AreaType = 'sori' | 'xona' | 'katta_xona'
export type OrderStatus = 'open' | 'closed' | 'cancelled'
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error'
export type SyncAction = 'create' | 'update' | 'delete'
export type ProductUnit = 'dona' | 'kg' | 'porsiya' | 'litr'

export interface Waiter {
  id: number
  serverId: string | null
  firstName: string
  lastName: string
  phone: string | null
  role: WaiterRole
  avatarUrl: string | null
  isActive: boolean
  failedAttempts: number
  lockedUntil: number | null
  createdAt: number
  updatedAt: number
}

export interface Category {
  id: number
  serverId: string | null
  nameUzLatn: string
  nameUzCyrl: string | null
  icon: string | null
  color: string | null
  sortOrder: number
  isActive: boolean
}

export interface Product {
  id: number
  serverId: string | null
  categoryId: number
  nameUzLatn: string
  nameUzCyrl: string | null
  price: number
  unit: ProductUnit
  photo: string | null
  imageUrl: string | null
  emoji: string | null
  isAvailable: boolean
  stock: number | null
  sortOrder: number
}

export interface Area {
  id: number
  serverId: string | null
  name: string
  type: AreaType
  icon: string | null
  color: string | null
  sortOrder: number
}

export interface TableEntity {
  id: number
  serverId: string | null
  areaId: number
  name: string
  capacity: number | null
  sortOrder: number
}

export interface OrderItem {
  id: number
  serverId: string | null
  localUuid: string
  orderId: number
  productId: number
  productName: string
  unitPrice: number
  quantity: number
  notes: string | null
  syncStatus: SyncStatus
  createdAt: number
  updatedAt: number
}

export interface Order {
  id: number
  serverId: string | null
  localUuid: string
  tableId: number
  waiterId: number
  status: OrderStatus
  subtotal: number
  serviceFee: number
  total: number
  openedAt: number
  closedAt: number | null
  printedAt: number | null
  notes: string | null
  syncStatus: SyncStatus
  createdAt: number
  updatedAt: number
}

export interface OrderWithItems extends Order {
  items: OrderItem[]
}

export interface TableWithOrder {
  table: TableEntity
  order: OrderWithItems | null
}

export interface Settings {
  serverUrl: string
  serverWsUrl: string
  apiToken: string | null
  branchId: string | null
  language: Lang
  printerType: 'usb' | 'network' | 'windows' | 'raw' | null
  printerVid: string | null
  printerPid: string | null
  printerIp: string | null
  printerName: string | null
  printerDevicePath: string | null
  organizationName: string
  serviceFeePercent: number
  receiptHeader: string | null
  receiptFooter: string | null
}

export interface ReceiptPayload {
  organizationName: string
  tableName: string
  waiterName: string
  orderLocalUuid: string
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>
  subtotal: number
  serviceFeePercent: number
  serviceFee: number
  total: number
  printedAt: number
  receiptHeader: string | null
  receiptFooter: string | null
}

export interface SyncEvent {
  type:
    | 'menu.updated'
    | 'category.updated'
    | 'product.updated'
    | 'waiter.updated'
    | 'area.updated'
    | 'table.updated'
    | 'order.updated'
    | 'order.closed'
  payload: unknown
  at: number
}

export interface ServerUser {
  id: string
  firstName: string
  lastName: string
  role: string
  phoneNumer: string
}

export interface BranchInfo {
  id: string
  name: string
  addres: string
  companyId: string
}

export interface ServerLoginResult {
  ok: boolean
  token?: string
  user?: ServerUser
  branches?: BranchInfo[]
  message?: string
}
