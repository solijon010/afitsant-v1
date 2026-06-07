import { getDb } from '../db/connection'

export interface CatConfig {
  serverId: string
  localName: string | null
  sortOrderOverride: number | null
  isHidden: boolean
}

export function getCategoryConfigs(): CatConfig[] {
  const rows = getDb()
    .prepare(`SELECT * FROM category_config`)
    .all() as any[]
  return rows.map((r) => ({
    serverId: r.server_id,
    localName: r.local_name ?? null,
    sortOrderOverride: r.sort_order_override ?? null,
    isHidden: !!r.is_hidden
  }))
}

export function setCategoryConfig(
  serverId: string,
  patch: Partial<Omit<CatConfig, 'serverId'>>
): void {
  const db = getDb()
  // upsert
  db.prepare(`
    INSERT INTO category_config (server_id, local_name, sort_order_override, is_hidden)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(server_id) DO UPDATE SET
      local_name           = COALESCE(excluded.local_name, local_name),
      sort_order_override  = excluded.sort_order_override,
      is_hidden            = excluded.is_hidden
  `).run(
    serverId,
    patch.localName ?? null,
    patch.sortOrderOverride ?? null,
    patch.isHidden ? 1 : 0
  )
}

/** Barcha patch'larni bir transaksiyada saqlash */
export function saveCategoryConfigs(configs: CatConfig[]): void {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO category_config (server_id, local_name, sort_order_override, is_hidden)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(server_id) DO UPDATE SET
      local_name          = excluded.local_name,
      sort_order_override = excluded.sort_order_override,
      is_hidden           = excluded.is_hidden
  `)
  db.transaction(() => {
    for (const c of configs) {
      stmt.run(c.serverId, c.localName, c.sortOrderOverride, c.isHidden ? 1 : 0)
    }
  })()
}

/** Biror kategoriya mahsulotlarini boshqasiga ko'chirish */
export function moveProductsToCategory(
  fromServerId: string,
  toServerId: string
): { moved: number } {
  const db = getDb()
  // Avval mavjud override'larni yangilaymiz
  db.prepare(`
    INSERT INTO product_category_override (product_server_id, target_category_server_id)
    SELECT p.server_id, ?
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE c.server_id = ?
      AND p.server_id IS NOT NULL
    ON CONFLICT(product_server_id) DO UPDATE SET target_category_server_id = excluded.target_category_server_id
  `).run(toServerId, fromServerId)

  const moved = (db.prepare(`
    SELECT COUNT(*) as cnt FROM product_category_override WHERE target_category_server_id = ?
  `).get(toServerId) as any)?.cnt ?? 0

  return { moved }
}

/** Barcha mahsulot ko'chirish override larini o'chirish — asl joylarga qaytarish */
export function clearAllProductCategoryOverrides(): void {
  getDb().prepare(`DELETE FROM product_category_override`).run()
}

/** product_category_override'ni categories.category_id ga qo'llash */
export function applyProductCategoryOverrides(): void {
  const db = getDb()
  // Har bir override uchun: mahsulotning category_id ni target_category'ning local id'ga o'zgartir
  db.prepare(`
    UPDATE products
    SET category_id = (
      SELECT c.id FROM categories c
      JOIN product_category_override pco ON c.server_id = pco.target_category_server_id
      WHERE pco.product_server_id = products.server_id
    )
    WHERE server_id IN (SELECT product_server_id FROM product_category_override)
      AND EXISTS (
        SELECT 1 FROM product_category_override pco
        JOIN categories c ON c.server_id = pco.target_category_server_id
        WHERE pco.product_server_id = products.server_id
      )
  `).run()
}
