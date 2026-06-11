import type {
  Area,
  Category,
  Order,
  OrderItem,
  Product,
  TableEntity,
  Waiter
} from '@shared/types'

type Row = Record<string, any>

export const mapWaiter = (r: Row): Waiter => ({
  id: r.id,
  serverId: r.server_id,
  firstName: r.first_name,
  lastName: r.last_name,
  phone: r.phone,
  role: r.role,
  avatarUrl: r.avatar_url,
  isActive: !!r.is_active,
  failedAttempts: r.failed_attempts,
  lockedUntil: r.locked_until,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

export const mapCategory = (r: Row): Category => ({
  id: r.id,
  serverId: r.server_id,
  nameUzLatn: r.name_uz_latn,
  nameUzCyrl: r.name_uz_cyrl,
  icon: r.icon,
  color: r.color,
  sortOrder: r.sort_order,
  isActive: !!r.is_active
})

export const mapProduct = (r: Row): Product => ({
  id: r.id,
  serverId: r.server_id,
  categoryId: r.category_id,
  nameUzLatn: r.name_uz_latn,
  nameUzCyrl: r.name_uz_cyrl,
  price: r.price,
  unit: r.unit,
  photo: r.image_url,
  imageUrl: r.image_url,
  emoji: r.emoji,
  isAvailable: !!r.is_available,
  stock: r.stock,
  sortOrder: r.sort_order
})

export const mapArea = (r: Row): Area => ({
  id: r.id,
  serverId: r.server_id,
  name: r.name,
  type: r.type,
  icon: r.icon,
  color: r.color,
  sortOrder: r.sort_order
})

export const mapTable = (r: Row): TableEntity => ({
  id: r.id,
  serverId: r.server_id,
  areaId: r.area_id,
  name: r.name,
  capacity: r.capacity,
  sortOrder: r.sort_order
})

export const mapOrder = (r: Row): Order => ({
  id: r.id,
  serverId: r.server_id,
  localUuid: r.local_uuid,
  tableId: r.table_id,
  waiterId: r.waiter_id,
  status: r.status,
  subtotal: r.subtotal,
  serviceFee: r.service_fee,
  total: r.total,
  openedAt: r.opened_at,
  closedAt: r.closed_at,
  printedAt: r.printed_at,
  notes: r.notes,
  syncStatus: r.sync_status,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

export const mapOrderItem = (r: Row): OrderItem => ({
  id: r.id,
  serverId: r.server_id,
  productServerId: r.product_server_id ?? null,
  localUuid: r.local_uuid,
  orderId: r.order_id,
  productId: r.product_id,
  productName: r.product_name,
  unitPrice: r.unit_price,
  quantity: r.quantity,
  notes: r.notes,
  syncStatus: r.sync_status,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})
