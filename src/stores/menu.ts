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

    // Kategoriyalar: dublikat olib tashlash — tartib DB dan (eff_order / sort_order_override)
    const seenCat = new Set<string>()
    const uniqueCategories = snap.categories
      .filter((c) => {
        const key = (c.nameUzLatn ?? '').toLowerCase().trim()
        if (!key || seenCat.has(key)) return false
        seenCat.add(key)
        return true
      })
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    // Mahsulotlar: bir xil nom + kategoriya bo'lsa — rasmlisi yoki birinchisini qoldirish
    const seenProd = new Map<string, Product>()
    for (const p of snap.products) {
      const key = `${p.categoryId}:${(p.nameUzLatn ?? '').toLowerCase().trim()}`
      const existing = seenProd.get(key)
      if (!existing) {
        seenProd.set(key, p)
      } else {
        // Rasmlisi ustunlik qiladi
        if (!existing.photo && p.photo) seenProd.set(key, p)
      }
    }
    const uniqueProducts = Array.from(seenProd.values())

    set({ categories: uniqueCategories, products: uniqueProducts, loadedAt: Date.now() })
    preloadImages(uniqueProducts.map((p) => p.photo))
  },
  productsByCategory: (categoryId) => {
    const LAST_KEYWORDS = ['yarimta']
    return get().products
      .filter((p) => p.categoryId === categoryId)
      .sort((a, b) => {
        const aLast = LAST_KEYWORDS.some(k => (a.nameUzLatn ?? '').toLowerCase().includes(k))
        const bLast = LAST_KEYWORDS.some(k => (b.nameUzLatn ?? '').toLowerCase().includes(k))
        if (aLast !== bLast) return aLast ? 1 : -1
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      })
  }
}))
