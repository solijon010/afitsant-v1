import axios, { AxiosInstance } from 'axios'
import { getSettings, patchSettings } from './settings'

let cached: { instance: AxiosInstance; baseUrl: string } | null = null

export function getRemoteApi(): AxiosInstance {
  const s = getSettings()
  if (cached && cached.baseUrl === s.serverUrl) return cached.instance

  const instance = axios.create({ baseURL: s.serverUrl, timeout: 15_000 })

  instance.interceptors.request.use((config) => {
    const token = getSettings().apiToken
    if (token) config.headers.Authorization = `Bearer ${token}`
    else delete config.headers.Authorization
    return config
  })

  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response?.status === 401) {
        patchSettings({ apiToken: null })
        cached = null
      }
      return Promise.reject(err)
    }
  )

  cached = { instance, baseUrl: s.serverUrl }
  return cached.instance
}

export function resetRemoteApi(): void {
  cached = null
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const toArray = (raw: unknown): any[] => (Array.isArray(raw) ? raw : ((raw as any)?.data ?? []))

export async function fetchVisibleOrders(limit = 500): Promise<any[]> {
  const s = getSettings()
  if (!s.apiToken) return []
  const api = getRemoteApi()
  const urls = [
    ...(s.branchId ? [`/api/order/branch/${s.branchId}?limit=${limit}`] : []),
    '/api/order/my'
  ]
  for (const url of urls) {
    try { return toArray((await api.get(url)).data) } catch {}
  }
  return []
}

export async function updateRemoteOrderStatus(orderId: string, status: 'SUCCESS' | 'CANCELED'): Promise<void> {
  await getRemoteApi().patch(`/api/order/status/${orderId}`, null, { params: { status } })
}
