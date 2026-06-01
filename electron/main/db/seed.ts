import type Database from 'better-sqlite3'

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
}
