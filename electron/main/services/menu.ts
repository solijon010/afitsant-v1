import { getDb } from '../db/connection'
import { mapCategory, mapProduct } from '../db/mappers'
import type { Category, Product } from '@shared/types'

export function getCategories(): Category[] {
  const rows = getDb()
    .prepare(
      `SELECT
         c.*,
         COALESCE(cc.local_name, c.name_uz_latn) AS eff_name,
         COALESCE(cc.sort_order_override, c.sort_order) AS eff_order
       FROM categories c
       LEFT JOIN category_config cc ON cc.server_id = c.server_id
       WHERE c.is_active = 1
         AND COALESCE(cc.is_hidden, 0) = 0
         AND c.id IN (
           SELECT MIN(id) FROM categories
           WHERE is_active = 1
           GROUP BY LOWER(TRIM(name_uz_latn))
         )
       ORDER BY eff_order, eff_name`
    )
    .all() as any[]
  return rows.map((r) => mapCategory({ ...r, name_uz_latn: r.eff_name, sort_order: r.eff_order }))
}

/** Barcha kategoriyalar (yashirilganlar ham) — Sozlamalar sahifasi uchun */
export function getAllCategories(): Category[] {
  const rows = getDb()
    .prepare(
      `SELECT
         c.*,
         COALESCE(cc.local_name, c.name_uz_latn) AS eff_name,
         COALESCE(cc.sort_order_override, c.sort_order) AS eff_order
       FROM categories c
       LEFT JOIN category_config cc ON cc.server_id = c.server_id
       WHERE c.is_active = 1
         AND c.id IN (
           SELECT MIN(id) FROM categories
           WHERE is_active = 1
           GROUP BY LOWER(TRIM(name_uz_latn))
         )
       ORDER BY eff_order, eff_name`
    )
    .all() as any[]
  return rows.map((r) => mapCategory({ ...r, name_uz_latn: r.eff_name, sort_order: r.eff_order }))
}

export function getProducts(categoryId?: number): Product[] {
  const db = getDb()
  const sql = `
    SELECT p.*,
      COALESCE(pso.sort_order_override, p.sort_order) AS eff_order
    FROM products p
    LEFT JOIN product_sort_override pso ON pso.product_server_id = p.server_id
    WHERE p.is_available = 1
      ${categoryId ? 'AND p.category_id = ?' : ''}
    ORDER BY ${categoryId ? 'eff_order, p.name_uz_latn' : 'p.category_id, eff_order'}
  `
  const rows = categoryId
    ? (db.prepare(sql).all(categoryId) as any[])
    : (db.prepare(sql).all() as any[])
  return rows.map((r) => mapProduct({ ...r, sort_order: r.eff_order }))
}

export function getSnapshot(): { categories: Category[]; products: Product[] } {
  return { categories: getCategories(), products: getProducts() }
}
