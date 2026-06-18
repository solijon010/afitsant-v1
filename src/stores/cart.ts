import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Product } from '@shared/types'

export interface CartLine {
  localUuid: string
  productId: number
  productServerId: string | null
  productName: string
  unitPrice: number
  quantity: number
  notes: string | null
  flushed: boolean
  itemId: number | null
  addedAt: number
}

interface CartState {
  orderId: number | null
  serverOrderId: string | null
  tableId: number | null
  roomServerId: string | null
  lines: CartLine[]
  serviceFeePercent: number
  /** O'chirishlar sodir bo'lgan vaqt — useCartFlush bu o'zgarishni kuzatib server sync ishga tushiradi */
  removeTriggeredAt: number
  setOrder: (orderId: number | null, tableId: number | null, serverOrderId?: string | null, roomServerId?: string | null) => void
  hydrateFromOrder: (lines: CartLine[]) => void
  add: (product: Product, quantity?: number) => void
  increment: (localUuid: string) => void
  decrement: (localUuid: string) => void
  setQuantity: (localUuid: string, quantity: number) => void
  remove: (localUuid: string) => void
  clear: () => void
  pendingCount: () => number
  subtotal: () => number
  serviceFee: () => number
  total: () => number
}

/** IPC orqali SQLite item o'chirish (fire-and-forget) */
function ipcRemoveItem(itemId: number): void {
  if (typeof window !== 'undefined' && window.afisant?.orders?.removeItem) {
    void window.afisant.orders.removeItem(itemId).catch((e: any) =>
      console.warn('[cart] removeItem IPC failed:', e?.message)
    )
  }
}

/** IPC orqali SQLite item miqdorini yangilash (fire-and-forget) */
function ipcUpdateItem(itemId: number, quantity: number): void {
  if (typeof window !== 'undefined' && window.afisant?.orders?.updateItem) {
    void window.afisant.orders.updateItem(itemId, { quantity }).catch((e: any) =>
      console.warn('[cart] updateItem IPC failed:', e?.message)
    )
  }
}

export const useCart = create<CartState>((set, get) => ({
  orderId: null,
  serverOrderId: null,
  tableId: null,
  roomServerId: null,
  lines: [],
  serviceFeePercent: 0,
  removeTriggeredAt: 0,

  setOrder: (orderId, tableId, serverOrderId = null, roomServerId = null) =>
    set({ orderId, tableId, serverOrderId, roomServerId, lines: [], removeTriggeredAt: 0 }),

  hydrateFromOrder: (lines) => set({ lines }),

  add: (product, quantity = 1) => {
    const lines = get().lines
    const same = lines.find((l) => l.productId === product.id)
    if (same) {
      set({
        lines: lines.map((l) =>
          l.localUuid === same.localUuid
            ? { ...l, quantity: l.quantity + quantity, flushed: false }
            : l
        )
      })
      return
    }
    set({
      lines: [
        ...lines,
        {
          localUuid: nanoid(),
          productId: product.id,
          productServerId: product.serverId ?? null,
          productName: product.nameUzLatn,
          unitPrice: product.price,
          quantity,
          notes: null,
          flushed: false,
          itemId: null,
          addedAt: Date.now()
        }
      ]
    })
  },

  increment: (localUuid) => {
    set({
      lines: get().lines.map((l) =>
        l.localUuid === localUuid ? { ...l, quantity: l.quantity + 1, flushed: false } : l
      )
    })
  },

  decrement: (localUuid) => {
    const line = get().lines.find((l) => l.localUuid === localUuid)
    if (!line) return

    if (line.quantity <= 1) {
      // Item o'chiriladi — remove() da SQLite va server sync ishga tushadi
      get().remove(localUuid)
      return
    }

    const newQty = line.quantity - 1
    set({
      lines: get().lines.map((l) =>
        l.localUuid === localUuid ? { ...l, quantity: newQty, flushed: false } : l
      )
    })
    // SQLite ni darhol yangilaymiz (10s debounce kutmasdan)
    if (line.itemId) ipcUpdateItem(line.itemId, newQty)
  },

  setQuantity: (localUuid, quantity) => {
    if (quantity <= 0) {
      // Item o'chiriladi — remove() da SQLite va server sync ishga tushadi
      get().remove(localUuid)
      return
    }
    const line = get().lines.find((l) => l.localUuid === localUuid)
    set({
      lines: get().lines.map((l) =>
        l.localUuid === localUuid ? { ...l, quantity, flushed: false } : l
      )
    })
    // SQLite ni darhol yangilaymiz
    if (line?.itemId) ipcUpdateItem(line.itemId, quantity)
  },

  remove: (localUuid) => {
    const line = get().lines.find((l) => l.localUuid === localUuid)

    set({
      lines: get().lines.filter((l) => l.localUuid !== localUuid),
      // removeTriggeredAt o'zgarishi useCartFlush da server sync ishga tushiradi
      removeTriggeredAt: Date.now()
    })

    // SQLite dan darhol o'chiramiz — syncEngine eski itemni ko'rmasin
    if (line?.itemId) ipcRemoveItem(line.itemId)
  },

  clear: () => set({ lines: [], removeTriggeredAt: Date.now() }),

  pendingCount: () => get().lines.filter((l) => !l.flushed).length,
  subtotal: () => get().lines.reduce((s, l) => s + Math.round(l.unitPrice * l.quantity), 0),
  serviceFee: () => Math.round((get().subtotal() * get().serviceFeePercent) / 100),
  total: () => get().subtotal() + get().serviceFee()
}))
