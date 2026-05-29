import { create } from 'zustand'
import type { Category, Product } from '@shared/types'
import { preloadImages } from '@/lib/imageCache'

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
    // nom bo'yicha dublikatlarni olib tashlash (server_id null bo'lsa ham ishlaydi)
    const seen = new Set<string>()
    const uniqueCategories = snap.categories.filter((c) => {
      const key = (c.nameUzLatn ?? '').toLowerCase().trim()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    set({ categories: uniqueCategories, products: snap.products, loadedAt: Date.now() })
    // Barcha mahsulot rasmlarini background da oldindan yuklab cache ga saqlaymiz
    preloadImages(snap.products.map((p) => p.photo))
  },
  productsByCategory: (categoryId) => get().products.filter((p) => p.categoryId === categoryId)
}))
