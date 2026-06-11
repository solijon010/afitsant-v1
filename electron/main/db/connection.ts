import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRATIONS, SCHEMA_VERSION } from './schema'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const userData = app.getPath('userData')
  if (!existsSync(userData)) mkdirSync(userData, { recursive: true })

  const file = join(userData, 'afisant.db')
  db = new Database(file)

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('temp_store = MEMORY')
  db.pragma('mmap_size = 268435456')

  runMigrations(db)
  clearMockData(db)
  return db
}

function clearMockData(d: Database.Database): void {
  try {
    const hasServerBackedData = (d.prepare(`
      SELECT
        (SELECT COUNT(*) FROM waiters WHERE server_id IS NOT NULL) +
        (SELECT COUNT(*) FROM categories WHERE server_id IS NOT NULL) +
        (SELECT COUNT(*) FROM areas WHERE server_id IS NOT NULL) +
        (SELECT COUNT(*) FROM tables WHERE server_id IS NOT NULL) AS c
    `).get() as { c: number }).c > 0

    if (!hasServerBackedData) return

    d.transaction(() => {
      // Server data bor bo'lsa legacy demo catalog tozalanadi, aks holda offline demo saqlanadi.
      d.prepare(`DELETE FROM order_items WHERE order_id IN (SELECT o.id FROM orders o JOIN tables t ON o.table_id = t.id WHERE t.server_id IS NULL)`).run()
      d.prepare(`DELETE FROM orders WHERE table_id IN (SELECT id FROM tables WHERE server_id IS NULL)`).run()
      d.prepare(`DELETE FROM waiters WHERE server_id IS NULL`).run()
      d.prepare(`DELETE FROM areas WHERE server_id IS NULL`).run()
      d.prepare(`DELETE FROM categories WHERE server_id IS NULL`).run()
    })()
  } catch (e: any) {
    console.warn('[DB] clearMockData error (ignored):', e?.message)
  }
}

function runMigrations(d: Database.Database): void {
  d.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`)
  const row = d.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined
  const current = row ? Number(row.value) : 0

  const versions = Object.keys(MIGRATIONS)
    .map(Number)
    .sort((a, b) => a - b)

  const tx = d.transaction(() => {
    for (const v of versions) {
      if (v > current) d.exec(MIGRATIONS[v])
    }
    d.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`).run(
      String(SCHEMA_VERSION)
    )
  })
  tx()
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
