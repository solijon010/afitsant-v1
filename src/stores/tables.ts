import { create } from 'zustand'
import type { Area, TableWithOrder } from '@shared/types'

interface TablesState {
  areas: Area[]
  snapshot: TableWithOrder[]
  load: () => Promise<void>
  refreshTable: (tableId: number) => Promise<void>
}

export const useTables = create<TablesState>((set, get) => ({
  areas: [],
  snapshot: [],
  load: async () => {
    const [areas, snap] = await Promise.all([
      window.afisant.areas.list(),
      window.afisant.tables.snapshot()
    ])
    set({ areas, snapshot: snap })
  },
  refreshTable: async (tableId) => {
    const order = await window.afisant.tables.getByTable(tableId)
    set({
      snapshot: get().snapshot.map((s) => (s.table.id === tableId ? { ...s, order } : s))
    })
  }
}))
