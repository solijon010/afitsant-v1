import { getDb } from '../db/connection'
import type { Lang, Settings } from '@shared/types'

const DEFAULTS: Settings = {
  serverUrl: 'https://api-restaurant.hisobchim.uz',
  serverWsUrl: 'wss://api-restaurant.hisobchim.uz',
  apiToken: null,
  branchId: null,
  language: 'uz-latn',
  printerType: null,
  printerVid: null,
  printerPid: null,
  printerIp: null,
  printerName: null,
  printerDevicePath: '/dev/usb/lp0',
  organizationName: '',
  organizationAddress: null,
  organizationPhone: null,
  serviceFeePercent: 0,
  receiptHeader: null,
  receiptFooter: null,
  receiptQrText: null,
  receiptQrLabel: null
}

export function getSettings(): Settings {
  const db = getDb()
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string | null }>
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const get = <K extends keyof Settings>(k: K, parse: (v: string | null | undefined) => Settings[K]): Settings[K] =>
    parse(map.get(k as string) ?? null)

  return {
    serverUrl: get('serverUrl', (v) => v ?? DEFAULTS.serverUrl),
    serverWsUrl: get('serverWsUrl', (v) => v ?? DEFAULTS.serverWsUrl),
    apiToken: get('apiToken', (v) => (v && v !== 'null' && v.trim() !== '' ? v.trim() : null)),
    branchId: get('branchId', (v) => (v && v !== 'null' && v.trim() !== '' ? v.trim() : null)),
    language: get('language', (v) => ((v as Lang) ?? DEFAULTS.language)),
    printerType: get('printerType', (v) => (v ? (v as Settings['printerType']) : null)),
    printerVid: get('printerVid', (v) => (v ? v : null)),
    printerPid: get('printerPid', (v) => (v ? v : null)),
    printerIp: get('printerIp', (v) => (v ? v : null)),
    printerName: get('printerName', (v) => (v ? v : null)),
    printerDevicePath: get('printerDevicePath', (v) => v ?? DEFAULTS.printerDevicePath),
    organizationName: get('organizationName', (v) => v ?? DEFAULTS.organizationName),
    organizationAddress: get('organizationAddress', (v) => (v ? v : DEFAULTS.organizationAddress)),
    organizationPhone: get('organizationPhone', (v) => (v ? v : DEFAULTS.organizationPhone)),
    serviceFeePercent: get('serviceFeePercent', (v) => (v !== null && v !== '' ? Number(v) : DEFAULTS.serviceFeePercent)),
    receiptHeader: get('receiptHeader', (v) => (v ? v : DEFAULTS.receiptHeader)),
    receiptFooter: get('receiptFooter', (v) => (v ? v : DEFAULTS.receiptFooter)),
    receiptQrText: get('receiptQrText', (v) => (v ? v : DEFAULTS.receiptQrText)),
    receiptQrLabel: get('receiptQrLabel', (v) => (v ? v : DEFAULTS.receiptQrLabel))
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const db = getDb()
  const stmt = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      stmt.run(k, v === null || v === undefined ? '' : String(v))
    }
  })
  tx()
  return getSettings()
}
