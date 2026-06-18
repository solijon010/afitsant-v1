import { getDb } from '../db/connection'

export interface Settings {
  serverUrl: string
  serverWsUrl: string
  apiToken: string | null
  branchId: string | null
  language: string
  serviceFeePercent: number
  organizationName: string
  organizationAddress: string | null
  organizationPhone: string | null
}

const DEFAULTS: Settings = {
  serverUrl: process.env.REMOTE_API_URL ?? 'https://api-restaurant.hisobchim.uz',
  serverWsUrl: process.env.REMOTE_WS_URL ?? 'wss://api-restaurant.hisobchim.uz',
  apiToken: process.env.API_TOKEN ?? null,
  branchId: process.env.BRANCH_ID ?? null,
  language: 'uz-latn',
  serviceFeePercent: 0,
  organizationName: '',
  organizationAddress: null,
  organizationPhone: null
}

export function getSettings(): Settings {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string | null }>
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const get = (k: string) => map.get(k) ?? null

  return {
    serverUrl: get('serverUrl') ?? DEFAULTS.serverUrl,
    serverWsUrl: get('serverWsUrl') ?? DEFAULTS.serverWsUrl,
    apiToken: (() => { const v = get('apiToken'); return v && v !== 'null' && v.trim() !== '' ? v.trim() : DEFAULTS.apiToken })(),
    branchId: (() => { const v = get('branchId'); return v && v !== 'null' && v.trim() !== '' ? v.trim() : DEFAULTS.branchId })(),
    language: get('language') ?? DEFAULTS.language,
    serviceFeePercent: (() => { const v = get('serviceFeePercent'); return v !== null ? Number(v) : DEFAULTS.serviceFeePercent })(),
    organizationName: get('organizationName') ?? DEFAULTS.organizationName,
    organizationAddress: get('organizationAddress') ?? DEFAULTS.organizationAddress,
    organizationPhone: get('organizationPhone') ?? DEFAULTS.organizationPhone
  }
}

export function patchSettings(patch: Partial<Settings>): Settings {
  const db = getDb()
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      stmt.run(k, v == null ? null : String(v))
    }
  })()
  return getSettings()
}
