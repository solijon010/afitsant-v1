import { create } from 'zustand'
import type { Category, Product } from '@shared/types'
import { preloadImages } from '@/lib/imageCache'

// Foydalanuvchi xohlagan tartib
const CAT_ORDER: Record<string, number> = {
  'asosiy taomlar': 1,
  'asosiy mahsulotlar': 1,
  'salatlar': 2,
  'salat': 2,
  'ichimliklar': 3,
  'go\'sht va shashliklar': 4,
  'go\'sht': 4,
  'shashlik': 4,
  'maxsus taomlar': 5,
  'qo\'shimchalar': 6,
  'zakaz taomlar': 7,
}

function catSortKey(name: string): number {
  const lower = (name ?? '').toLowerCase().trim()
  for (const [key, order] of Object.entries(CAT_ORDER)) {
    if (lower.includes(key)) return order
  }
  return 99
}

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

    // Kategoriyalar: dublikat olib tashlash + tartib
    const seenCat = new Set<string>()
    const uniqueCategories = snap.categories
      .filter((c) => {
        const key = (c.nameUzLatn ?? '').toLowerCase().trim()
        if (!key || seenCat.has(key)) return false
        seenCat.add(key)
        return true
      })
      .sort((a, b) => {
        const oa = catSortKey(a.nameUzLatn ?? '')
        const ob = catSortKey(b.nameUzLatn ?? '')
        if (oa !== ob) return oa - ob
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      })

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
  productsByCategory: (categoryId) => get().products.filter((p) => p.categoryId === categoryId)
}))
