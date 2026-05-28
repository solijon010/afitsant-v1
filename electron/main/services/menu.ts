import { getDb } from '../db/connection'
import { mapCategory, mapProduct } from '../db/mappers'
import type { Category, Product } from '@shared/types'

export function getCategories(): Category[] {
  // MIN(id) GROUP BY nom — bir xil nomli kategoriya bir marta chiqadi
  const rows = getDb()
    .prepare(
      `SELECT * FROM categories
       WHERE is_active = 1
         AND id IN (
           SELECT MIN(id) FROM categories
           WHERE is_active = 1
           GROUP BY LOWER(TRIM(name_uz_latn))
         )
       ORDER BY sort_order, name_uz_latn`
    )
    .all() as any[]
  return rows.map(mapCategory)
}

export function getProducts(categoryId?: number): Product[] {
  const db = getDb()
  const rows = categoryId
    ? (db
        .prepare(
          `SELECT * FROM products WHERE category_id = ? AND is_available = 1 ORDER BY sort_order, name_uz_latn`
        )
        .all(categoryId) as any[])
    : (db
        .prepare(`SELECT * FROM products WHERE is_available = 1 ORDER BY category_id, sort_order`)
        .all() as any[])
  return rows.map(mapProduct)
}

export function getSnapshot(): { categories: Category[]; products: Product[] } {
  return { categories: getCategories(), products: getProducts() }
}
