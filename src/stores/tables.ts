import { create } from 'zustand'
import type { Area, TableWithOrder } from '@shared/types'

interface TablesState {
  areas: Area[]
  snapshot: TableWithOrder[]
  activeAreaId: number | null
  setActiveAreaId: (id: number) => void
  load: () => Promise<void>
  refreshTable: (tableId: number) => Promise<void>
}

export const useTables = create<TablesState>((set, get) => ({
  areas: [],
  snapshot: [],
  activeAreaId: null,
  setActiveAreaId: (id) => set({ activeAreaId: id }),
  load: async () => {
    const [areas, snap] = await Promise.all([
      window.afisant.areas.list(),
      window.afisant.tables.snapshot()
    ])
    // Agar hali area tanlanmagan bo'lsa — birinchisini avtomatik tanlash
    const currentAreaId = get().activeAreaId
    const validArea = areas.find((a) => a.id === currentAreaId)
    const newAreaId = validArea ? currentAreaId : (areas[0]?.id ?? null)
    set({ areas, snapshot: snap, activeAreaId: newAreaId })
  },
  refreshTable: async (tableId) => {
    const order = await window.afisant.tables.getByTable(tableId)
    set({
      snapshot: get().snapshot.map((s) => (s.table.id === tableId ? { ...s, order } : s))
    })
  }
}))
