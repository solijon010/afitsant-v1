import { getDb } from '../db/connection'
import { safeStorage } from 'electron'
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
  receiptQrLabel: null,
  offlineIdentifier: null,
  offlinePasswordHash: null,
  offlineUserJson: null,
  offlineToken: null,
  offlineBranchId: null
}

const ENCRYPTED_KEYS = new Set<keyof Settings>(['apiToken', 'offlineToken'])
const ENCRYPTED_PREFIX = 'enc:'

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encodeSetting(key: string, value: string): string {
  if (!ENCRYPTED_KEYS.has(key as keyof Settings) || value === '' || value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }
  if (!canEncrypt()) return value
  return `${ENCRYPTED_PREFIX}${safeStorage.encryptString(value).toString('base64')}`
}

function decodeSetting(key: string, value: string | null): string | null {
  if (!value || !ENCRYPTED_KEYS.has(key as keyof Settings) || !value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }
  if (!canEncrypt()) return null
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64'))
  } catch {
    return null
  }
}

export function getSettings(): Settings {
  const db = getDb()
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string | null }>
  const map = new Map(rows.map((r) => [r.key, decodeSetting(r.key, r.value)]))

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
    receiptQrLabel: get('receiptQrLabel', (v) => (v ? v : DEFAULTS.receiptQrLabel)),
    offlineIdentifier: get('offlineIdentifier', (v) => (v ? v : null)),
    offlinePasswordHash: get('offlinePasswordHash', (v) => (v ? v : null)),
    offlineUserJson: get('offlineUserJson', (v) => (v ? v : null)),
    offlineToken: get('offlineToken', (v) => (v ? v : null)),
    offlineBranchId: get('offlineBranchId', (v) => (v ? v : null))
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const db = getDb()
  const stmt = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      const raw = v === null || v === undefined ? '' : String(v)
      stmt.run(k, encodeSetting(k, raw))
    }
  })
  tx()
  return getSettings()
}

export function migrateSensitiveSettings(): void {
  const db = getDb()
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string | null }>
  const patch: Partial<Settings> = {}
  for (const row of rows) {
    if (!ENCRYPTED_KEYS.has(row.key as keyof Settings)) continue
    if (!row.value || row.value.startsWith(ENCRYPTED_PREFIX)) continue
    ;(patch as Record<string, string>)[row.key] = row.value
  }
  if (Object.keys(patch).length > 0) setSettings(patch)
}
