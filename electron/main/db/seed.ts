import bcrypt from 'bcryptjs'
import type Database from 'better-sqlite3'

const now = () => Date.now()

const DEFAULT_WAITERS: Array<{ firstName: string; lastName: string; phone: string; pin: string; role: string }> = [
  { firstName: 'Bekzod', lastName: 'Karimov', phone: '+998901112233', pin: '1234', role: 'super_waiter' },
  { firstName: 'Aziza', lastName: "G'ulomova", phone: '+998901112244', pin: '2345', role: 'waiter' },
  { firstName: 'Javohir', lastName: 'Saidov', phone: '+998901112255', pin: '3456', role: 'waiter' },
  { firstName: 'Madina', lastName: 'Rahmonova', phone: '+998901112266', pin: '4567', role: 'waiter' }
]

const DEFAULT_AREAS: Array<{ name: string; type: string; icon: string; color: string; tables: Array<{ name: string; capacity: number }> }> = [
  {
    name: "SO'RILAR",
    type: 'sori',
    icon: 'sofa',
    color: '#22c55e',
    tables: Array.from({ length: 11 }, (_, i) => ({ name: `So'ri ${i + 1}`, capacity: 6 }))
  },
  {
    name: 'XONALAR',
    type: 'xona',
    icon: 'users',
    color: '#a855f7',
    tables: Array.from({ length: 7 }, (_, i) => ({ name: `Xona ${i + 1}`, capacity: 8 }))
  },
  {
    name: 'KATTA XONALAR',
    type: 'katta_xona',
    icon: 'crown',
    color: '#f59e0b',
    tables: [
      { name: 'Katta xona 1', capacity: 20 },
      { name: 'Katta xona 2', capacity: 20 },
      { name: 'Katta xona 3', capacity: 24 }
    ]
  }
]

const DEFAULT_CATEGORIES: Array<{
  nameUzLatn: string
  nameUzCyrl: string
  icon: string
  color: string
  products: Array<{ nameUzLatn: string; nameUzCyrl: string; price: number; unit: string; emoji: string }>
}> = [
  {
    nameUzLatn: 'Asosiy',
    nameUzCyrl: 'Асосий',
    icon: 'package',
    color: '#f59e0b',
    products: [
      { nameUzLatn: 'Non', nameUzCyrl: 'Нон', price: 4000, unit: 'dona', emoji: '🥯' },
      { nameUzLatn: 'Choy', nameUzCyrl: 'Чой', price: 3000, unit: 'dona', emoji: '🍵' },
      { nameUzLatn: 'Salfetka', nameUzCyrl: 'Салфетка', price: 5000, unit: 'dona', emoji: '🧻' },
      { nameUzLatn: 'Nam salfetka', nameUzCyrl: 'Нам салфетка', price: 4000, unit: 'dona', emoji: '🧽' }
    ]
  },
  {
    nameUzLatn: 'Salatlar',
    nameUzCyrl: 'Салатлар',
    icon: 'leaf',
    color: '#22c55e',
    products: [
      { nameUzLatn: 'Kichik salat', nameUzCyrl: 'Кичик салат', price: 10000, unit: 'porsiya', emoji: '🥗' },
      { nameUzLatn: 'Katta salat', nameUzCyrl: 'Катта салат', price: 20000, unit: 'porsiya', emoji: '🥗' }
    ]
  },
  {
    nameUzLatn: "Qo'shimchalar",
    nameUzCyrl: 'Қўшимчалар',
    icon: 'plus',
    color: '#3b82f6',
    products: [
      { nameUzLatn: 'Qalampir', nameUzCyrl: 'Қалампир', price: 2000, unit: 'dona', emoji: '🌶️' }
    ]
  },
  {
    nameUzLatn: 'Ichimliklar',
    nameUzCyrl: 'Ичимликлар',
    icon: 'cup-soda',
    color: '#06b6d4',
    products: [
      { nameUzLatn: 'Pepsi 1L', nameUzCyrl: 'Пепси 1Л', price: 15000, unit: 'dona', emoji: '🥤' },
      { nameUzLatn: 'Pepsi 1.5L', nameUzCyrl: 'Пепси 1.5Л', price: 18000, unit: 'dona', emoji: '🥤' },
      { nameUzLatn: 'Coca-Cola 1.5L', nameUzCyrl: 'Кока-Кола 1.5Л', price: 18000, unit: 'dona', emoji: '🥤' },
      { nameUzLatn: 'Coca-Cola 2L', nameUzCyrl: 'Кока-Кола 2Л', price: 20000, unit: 'dona', emoji: '🥤' },
      { nameUzLatn: 'Fanta 1.5L', nameUzCyrl: 'Фанта 1.5Л', price: 18000, unit: 'dona', emoji: '🥤' },
      { nameUzLatn: 'Viko sok', nameUzCyrl: 'Вико сок', price: 22000, unit: 'dona', emoji: '🧃' },
      { nameUzLatn: 'Silver suv', nameUzCyrl: 'Силвер сув', price: 5000, unit: 'dona', emoji: '💧' },
      { nameUzLatn: 'Garden sharbat', nameUzCyrl: 'Гарден шарбат', price: 20000, unit: 'dona', emoji: '🧃' }
    ]
  },
  {
    nameUzLatn: 'Shashliklar',
    nameUzCyrl: 'Шашликлар',
    icon: 'flame',
    color: '#ef4444',
    products: [
      { nameUzLatn: 'Qiyma shashlik', nameUzCyrl: 'Қийма шашлик', price: 20000, unit: 'dona', emoji: '🍢' },
      { nameUzLatn: "Go'sht shashlik", nameUzCyrl: 'Гўшт шашлик', price: 24000, unit: 'dona', emoji: '🍖' },
      { nameUzLatn: "Qo'y go'shti shashlik", nameUzCyrl: 'Қўй гўшти шашлик', price: 30000, unit: 'dona', emoji: '🍖' }
    ]
  },
  {
    nameUzLatn: 'Maxsus taomlar',
    nameUzCyrl: 'Махсус таомлар',
    icon: 'chef-hat',
    color: '#eab308',
    products: [
      { nameUzLatn: 'Qanotcha (1 kg)', nameUzCyrl: 'Қанотча (1 кг)', price: 75000, unit: 'kg', emoji: '🍗' },
      { nameUzLatn: "O'rdak go'shti (1 kg)", nameUzCyrl: 'Ўрдак гўшти (1 кг)', price: 140000, unit: 'kg', emoji: '🦆' }
    ]
  }
]

const DEFAULT_SETTINGS: Record<string, string> = {
  serverUrl: 'https://api-restaurant.hisobchim.uz',
  serverWsUrl: 'wss://api-restaurant.hisobchim.uz',
  apiToken: '',
  language: 'uz-latn',
  printerType: '',
  printerVid: '',
  printerPid: '',
  printerIp: '',
  printerName: '',
  organizationName: 'Sohil Choyxona',
  serviceFeePercent: '1',
  receiptHeader: 'Xush kelibsiz!',
  receiptFooter: 'Tashrifingiz uchun rahmat!'
}

export function seedIfEmpty(db: Database.Database): void {
  const wCount = (db.prepare(`SELECT COUNT(*) AS c FROM waiters`).get() as { c: number }).c
  const aCount = (db.prepare(`SELECT COUNT(*) AS c FROM areas`).get() as { c: number }).c
  const cCount = (db.prepare(`SELECT COUNT(*) AS c FROM categories`).get() as { c: number }).c
  const sCount = (db.prepare(`SELECT COUNT(*) AS c FROM settings`).get() as { c: number }).c

  const tx = db.transaction(() => {
    if (sCount === 0) {
      const stmt = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`)
      for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) stmt.run(k, v)
    }

    if (wCount === 0) {
      const stmt = db.prepare(
        `INSERT INTO waiters (first_name, last_name, phone, pin_hash, role, is_active, failed_attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`
      )
      for (const w of DEFAULT_WAITERS) {
        const hash = bcrypt.hashSync(w.pin, 10)
        stmt.run(w.firstName, w.lastName, w.phone, hash, w.role, now(), now())
      }
    }

    if (aCount === 0) {
      const aStmt = db.prepare(
        `INSERT INTO areas (name, type, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)`
      )
      const tStmt = db.prepare(
        `INSERT INTO tables (area_id, name, capacity, sort_order) VALUES (?, ?, ?, ?)`
      )
      DEFAULT_AREAS.forEach((area, idx) => {
        const info = aStmt.run(area.name, area.type, area.icon, area.color, idx)
        area.tables.forEach((t, i) => tStmt.run(info.lastInsertRowid, t.name, t.capacity, i))
      })
    }

    if (cCount === 0) {
      const cStmt = db.prepare(
        `INSERT INTO categories (name_uz_latn, name_uz_cyrl, icon, color, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`
      )
      const pStmt = db.prepare(
        `INSERT INTO products (category_id, name_uz_latn, name_uz_cyrl, price, unit, emoji, is_available, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
      )
      DEFAULT_CATEGORIES.forEach((c, idx) => {
        const info = cStmt.run(c.nameUzLatn, c.nameUzCyrl, c.icon, c.color, idx)
        c.products.forEach((p, i) =>
          pStmt.run(info.lastInsertRowid, p.nameUzLatn, p.nameUzCyrl, p.price, p.unit, p.emoji, i)
        )
      })
    }
  })
  tx()
}
