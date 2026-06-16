import { create } from 'zustand'
import type { Area, TableWithOrder } from '@shared/types'

interface TablesState {
  areas: Area[]
  snapshot: TableWithOrder[]
  activeAreaId: number | null
  setActiveAreaId: (id: number | null) => void
  load: () => Promise<void>
  refreshTable: (tableId: number) => Promise<void>
}

export const useTables = create<TablesState>((set, get) => ({
  areas: [],
  snapshot: [],
  activeAreaId: null,
  setActiveAreaId: (id) => set({ activeAreaId: id }),
  load: async () => {
    // Avval tezkor lokal ma'lumotni yuklaymiz (server kutmasdan)
    const [areas, localSnap] = await Promise.all([
      window.afisant.areas.list(),
      window.afisant.tables.list().then((tables) =>
        tables.map((table) => ({ table, order: null as any }))
      ).catch(() => [] as TableWithOrder[])
    ])

    const currentAreaId = get().activeAreaId
    const validArea = areas.find((a) => a.id === currentAreaId)
    const newAreaId = validArea ? currentAreaId : (areas[0]?.id ?? null)

    // Agar snapshot bo'sh bo'lsa — lokal stollarni darhol ko'rsatamiz
    if (get().snapshot.length === 0 && localSnap.length > 0) {
      set({ areas, activeAreaId: newAreaId })
    } else {
      set({ areas, activeAreaId: newAreaId })
    }

    // Keyin server snapshot (buyurtmalar bilan) yuklanadi
    try {
      const snap = await window.afisant.tables.snapshot()
      set({ snapshot: snap })
    } catch {
      // Server xato — lokal SQLite dan yuklaymiz
      try {
        const tables = await window.afisant.tables.list()
        const fallback: TableWithOrder[] = await Promise.all(
          tables.map(async (table) => ({
            table,
            order: await window.afisant.tables.getByTable(table.id).catch(() => null)
          }))
        )
        set({ snapshot: fallback })
      } catch {
        // SQLite ham ishlamasa — bo'sh qoladi
      }
    }
  },
  refreshTable: async (tableId) => {
    const order = await window.afisant.tables.getByTable(tableId)
    set({
      snapshot: get().snapshot.map((s) => (s.table.id === tableId ? { ...s, order } : s))
    })
  }
}))
