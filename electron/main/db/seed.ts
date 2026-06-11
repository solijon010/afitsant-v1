import type Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'

const DEFAULT_SETTINGS: Record<string, string> = {
  serverUrl: 'https://api-restaurant.hisobchim.uz',
  serverWsUrl: 'wss://api-restaurant.hisobchim.uz',
  apiToken: '',
  branchId: '',
  language: 'uz-latn',
  printerType: '',
  printerVid: '',
  printerPid: '',
  printerIp: '',
  printerName: '',
  printerDevicePath: '/dev/usb/lp0',
  organizationName: '',
  organizationAddress: '',
  organizationPhone: '',
  serviceFeePercent: '0',
  receiptHeader: '',
  receiptFooter: '',
  receiptQrText: '',
  receiptQrLabel: ''
}

export function seedIfEmpty(db: Database.Database): void {
  const sCount = (db.prepare(`SELECT COUNT(*) AS c FROM settings`).get() as { c: number }).c

  if (sCount === 0) {
    const stmt = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`)
    const tx = db.transaction(() => {
      for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) stmt.run(k, v)
    })
    tx()
  }

  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM waiters) AS waiters,
      (SELECT COUNT(*) FROM categories) AS categories,
      (SELECT COUNT(*) FROM products) AS products,
      (SELECT COUNT(*) FROM areas) AS areas,
      (SELECT COUNT(*) FROM tables) AS tables
  `).get() as { waiters: number; categories: number; products: number; areas: number; tables: number }

  if (counts.waiters === 0) seedWaiters(db)
  if (counts.categories === 0 && counts.products === 0) seedMenu(db)
  if (counts.areas === 0 && counts.tables === 0) seedRooms(db)
}

function seedWaiters(db: Database.Database): void {
  const now = Date.now()
  const waiters = [
    ['Bekzod', 'Karimov', 'super_waiter', '1234'],
    ['Aziza', "G'ulomova", 'waiter', '2345'],
    ['Javohir', 'Saidov', 'waiter', '3456'],
    ['Madina', 'Rahmonova', 'waiter', '4567']
  ] as const

  const stmt = db.prepare(`
    INSERT INTO waiters (server_id, first_name, last_name, phone, pin_hash, role, created_at, updated_at)
    VALUES (NULL, ?, ?, NULL, ?, ?, ?, ?)
  `)

  db.transaction(() => {
    for (const [firstName, lastName, role, pin] of waiters) {
      stmt.run(firstName, lastName, bcrypt.hashSync(pin, 10), role, now, now)
    }
  })()
}

function seedMenu(db: Database.Database): void {
  const categories = [
    ['Asosiy', 'chef-hat', '#2563eb'],
    ['Shashlik', 'flame', '#dc2626'],
    ['Salatlar', 'leaf', '#16a34a'],
    ['Ichimliklar', 'cup-soda', '#0891b2'],
    ['Non va choy', 'package', '#d97706'],
    ['Maxsus', 'plus', '#7c3aed']
  ] as const

  const products = [
    [0, 'Osh', 35000, 'porsiya'],
    [0, 'Manti', 8000, 'dona'],
    [0, "Lag'mon", 30000, 'porsiya'],
    [1, "Qo'y shashlik", 18000, 'dona'],
    [1, "Go'sht shashlik", 16000, 'dona'],
    [1, 'Qiyma shashlik', 14000, 'dona'],
    [2, 'Katta salat', 18000, 'porsiya'],
    [2, 'Kichik salat', 10000, 'porsiya'],
    [2, 'Qalampir', 5000, 'porsiya'],
    [3, 'Coca-Cola 1.5L', 15000, 'dona'],
    [3, 'Fanta 1.5L', 15000, 'dona'],
    [3, 'Suv 1L', 5000, 'dona'],
    [4, 'Non', 5000, 'dona'],
    [4, 'Choy', 3000, 'dona'],
    [4, 'Salfetka', 2000, 'dona'],
    [5, 'Zakaz kabob', 50000, 'porsiya'],
    [5, "Tandir go'sht", 90000, 'kg'],
    [5, 'Jigar', 12000, 'dona'],
    [0, "Sho'rva", 28000, 'porsiya'],
    [1, 'Qanot', 13000, 'dona'],
    [3, 'Sharbat 1L', 18000, 'dona']
  ] as const

  const insertCat = db.prepare(`
    INSERT INTO categories (server_id, name_uz_latn, name_uz_cyrl, icon, color, sort_order, is_active)
    VALUES (NULL, ?, NULL, ?, ?, ?, 1)
  `)
  const insertProduct = db.prepare(`
    INSERT INTO products (server_id, category_id, name_uz_latn, name_uz_cyrl, price, unit, image_url, emoji, is_available, stock, sort_order)
    VALUES (NULL, ?, ?, NULL, ?, ?, NULL, NULL, 1, NULL, ?)
  `)

  db.transaction(() => {
    const categoryIds: number[] = []
    categories.forEach(([name, icon, color], index) => {
      const info = insertCat.run(name, icon, color, index)
      categoryIds.push(Number(info.lastInsertRowid))
    })
    products.forEach(([categoryIndex, name, price, unit], index) => {
      insertProduct.run(categoryIds[categoryIndex], name, price, unit, index)
    })
  })()
}

function seedRooms(db: Database.Database): void {
  const areas = [
    ['Sori', 'sori', '#16a34a'],
    ['Xona', 'xona', '#2563eb'],
    ['Katta xona', 'katta_xona', '#d97706']
  ] as const

  const insertArea = db.prepare(`
    INSERT INTO areas (server_id, name, type, icon, color, sort_order)
    VALUES (NULL, ?, ?, NULL, ?, ?)
  `)
  const insertTable = db.prepare(`
    INSERT INTO tables (server_id, area_id, name, capacity, sort_order)
    VALUES (NULL, ?, ?, NULL, ?)
  `)

  db.transaction(() => {
    const areaIds: number[] = []
    areas.forEach(([name, type, color], index) => {
      const info = insertArea.run(name, type, color, index)
      areaIds.push(Number(info.lastInsertRowid))
    })

    for (let i = 1; i <= 10; i++) insertTable.run(areaIds[0], `Sori ${i}`, i)
    for (let i = 1; i <= 8; i++) insertTable.run(areaIds[1], `Xona ${i}`, i)
    for (let i = 1; i <= 3; i++) insertTable.run(areaIds[2], `Katta xona ${i}`, i)
  })()
}
