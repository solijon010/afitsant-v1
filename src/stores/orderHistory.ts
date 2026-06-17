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
}

export const useOrderHistory = create<OrderHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      push: (entry) => {
        // Bir xona uchun 5 soniya ichida bir xil summa — duplikat hisoblaymiz
        const recent = get().entries.find(
          (e) =>
            e.tableId === entry.tableId &&
            Math.abs(e.savedAt - entry.savedAt) < 5000 &&
            e.total === entry.total
        )
        if (recent) return recent.id

        const id = `${entry.tableId}-${entry.savedAt}`
        set({ entries: [...get().entries.slice(-500), { ...entry, id, printCount: 0, printedAt: null }] })
        return id
      },
      markPrinted: (id) =>
        set({
          entries: get().entries.map((e) =>
            e.id === id ? { ...e, printCount: e.printCount + 1, printedAt: Date.now() } : e
          )
        })
    }),
    { name: 'pos-order-history-v1' }
  )
)
