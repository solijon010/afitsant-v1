import { getApi } from './apiClient'
import { getSettings } from './settings'

const toArray = (raw: unknown): any[] => (Array.isArray(raw) ? raw : ((raw as any)?.data ?? []))
const CLOSED_STATUSES = new Set(['CANCELED', 'CANCELLED', 'SUCCESS', 'COMPLETED', 'CLOSED', 'DONE', 'FINISHED'])

export function isActiveServerOrder(order: any): boolean {
  return !CLOSED_STATUSES.has(String(order?.status ?? '').toUpperCase())
}

export async function fetchVisibleOrders(limit = 200): Promise<any[]> {
  const s = getSettings()
  if (!s.apiToken) return []

  const api = getApi()
  const urls = [
    ...(s.branchId ? [`/api/order/branch/${s.branchId}?limit=${limit}`] : []),
    '/api/order/my'
  ]

  for (const url of urls) {
    try {
      const res = await api.get(url)
      const list = toArray(res.data)
      console.log(`[ORDER API] ${url} -> ${list.length} ta`)
      return list
    } catch (e: any) {
      console.warn(`[ORDER API] ${url} xato (${e?.response?.status ?? e?.code ?? e?.message})`)
    }
  }

  return []
}
