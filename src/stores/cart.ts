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

export const useCart = create<CartState>((set, get) => ({
  orderId: null,
  serverOrderId: null,
  tableId: null,
  roomServerId: null,
  lines: [],
  serviceFeePercent: 0,
  setOrder: (orderId, tableId, serverOrderId = null, roomServerId = null) =>
    set({ orderId, tableId, serverOrderId, roomServerId, lines: [] }),
  hydrateFromOrder: (lines) => set({ lines }),
  add: (product, quantity = 1) => {
    const lines = get().lines
    // flushed=true qatorlarni ham qidiradi — bir xil mahsulot ikki qator bo'lmasligi uchun
    const same = lines.find((l) => l.productId === product.id)
    if (same) {
      set({
        lines: lines.map((l) =>
          l.localUuid === same.localUuid ? { ...l, quantity: l.quantity + quantity, flushed: false } : l
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
      get().remove(localUuid)
      return
    }
    set({
      lines: get().lines.map((l) =>
        l.localUuid === localUuid ? { ...l, quantity: l.quantity - 1, flushed: false } : l
      )
    })
  },
  setQuantity: (localUuid, quantity) => {
    set({
      lines: get().lines.map((l) =>
        l.localUuid === localUuid ? { ...l, quantity: Math.max(0, quantity), flushed: false } : l
      )
    })
  },
  remove: (localUuid) => {
    set({ lines: get().lines.filter((l) => l.localUuid !== localUuid) })
  },
  clear: () => set({ lines: [] }),
  pendingCount: () => get().lines.filter((l) => !l.flushed).length,
  subtotal: () => get().lines.reduce((s, l) => s + Math.round(l.unitPrice * l.quantity), 0),
  serviceFee: () => Math.round((get().subtotal() * get().serviceFeePercent) / 100),
  total: () => get().subtotal() + get().serviceFee()
}))
