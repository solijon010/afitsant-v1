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
    set({ categories: snap.categories, products: snap.products, loadedAt: Date.now() })
  },
  productsByCategory: (categoryId) => get().products.filter((p) => p.categoryId === categoryId)
}))
