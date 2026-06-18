import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = process.env.DB_PATH
  if (!dbPath) throw new Error('DB_PATH muhit o\'zgaruvchisi o\'rnatilmagan')

  const dir = dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('temp_store = MEMORY')
  db.pragma('mmap_size = 268435456')

  return db
}

export function closeDb(): void {
  if (db) { db.close(); db = null }
}
