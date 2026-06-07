import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface HistoryItem {
  name: string
  quantity: number
  unitPrice: number
  total: number
}

export interface HistoryEntry {
  id: string
  tableId: number
  tableName: string
  waiterName: string
  savedAt: number
  printedAt: number | null
  printCount: number
  items: HistoryItem[]
  subtotal: number
  serviceFee: number
  total: number
}

interface OrderHistoryState {
  entries: HistoryEntry[]
  push: (e: Omit<HistoryEntry, 'id' | 'printCount' | 'printedAt'>) => string
  markPrinted: (id: string) => void
  clearAll: () => void
}

export const useOrderHistory = create<OrderHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      push: (entry) => {
        const id = `${entry.tableId}-${entry.savedAt}-${Math.random().toString(36).slice(2, 6)}`
        set({ entries: [...get().entries.slice(-500), { ...entry, id, printCount: 0, printedAt: null }] })
        return id
      },
      markPrinted: (id) =>
        set({
          entries: get().entries.map((e) =>
            e.id === id ? { ...e, printCount: e.printCount + 1, printedAt: Date.now() } : e
          )
        }),
      clearAll: () => set({ entries: [] })
    }),
    { name: 'pos-order-history-v1' }
  )
)
