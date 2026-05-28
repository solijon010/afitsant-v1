import { create } from 'zustand'
import type { Category, Product } from '@shared/types'

interface MenuState {
  categories: Category[]
  products: Product[]
  loadedAt: number | null
  load: () => Promise<void>
  productsByCategory: (categoryId: number) => Product[]
}

export const useMenu = create<MenuState>((set, get) => ({
  categories: [],
  products: [],
  loadedAt: null,
  load: async () => {
    const snap = await window.afisant.menu.getSnapshot()
    // server_id bo'yicha dublikatlarni olib tashlash
    const seen = new Set<string>()
    const uniqueCategories = snap.categories.filter((c) => {
      const key = c.serverId ?? String(c.id)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    set({ categories: uniqueCategories, products: snap.products, loadedAt: Date.now() })
  },
  productsByCategory: (categoryId) => get().products.filter((p) => p.categoryId === categoryId)
}))
