import { getApi } from './apiClient'
import { getSettings } from './settings'

const toArray = (raw: unknown): any[] => (Array.isArray(raw) ? raw : ((raw as any)?.data ?? []))
const totalOf = (raw: unknown): number | null => {
  const t = (raw as any)?.total
  return typeof t === 'number' ? t : null
}

// '/api/order/my' sahifalangan (page/limit) — bitta chaqiruv faqat 10 ta qaytaradi.
// Filialda 10 dan ko'p faol buyurtma bo'lsa, kerakli order topilmay qoladi va
// kod uni "mavjud emas" deb hisoblab, qayta yaratishga urinadi (server 403 "xona band").
// Shu sababli barcha sahifalarni yig'ib, to'liq ro'yxatni qaytaramiz.
async function fetchAllPages(url: string, api: ReturnType<typeof getApi>): Promise<any[]> {
  const PAGE_SIZE = 100
  const MAX_PAGES = 20 // himoya — cheksiz loop bo'lmasin
  const sep = url.includes('?') ? '&' : '?'

  const first = await api.get(`${url}${sep}page=1&limit=${PAGE_SIZE}`)
  const acc = toArray(first.data)
  const total = totalOf(first.data)

  if (total === null || acc.length >= total) return acc

  for (let page = 2; page <= MAX_PAGES && acc.length < total; page++) {
    const res = await api.get(`${url}${sep}page=${page}&limit=${PAGE_SIZE}`)
    const list = toArray(res.data)
    if (list.length === 0) break
    acc.push(...list)
  }
  return acc
}

export async function fetchVisibleOrders(): Promise<any[]> {
  const s = getSettings()
  if (!s.apiToken) return []

  const api = getApi()
  const urls = [
    ...(s.branchId ? [`/api/order/branch/${s.branchId}`] : []),
    '/api/order/my'
  ]

  for (const url of urls) {
    try {
      const list = await fetchAllPages(url, api)
      console.log(`[ORDER API] ${url} -> ${list.length} ta`)
      return list
    } catch (e: any) {
      console.warn(`[ORDER API] ${url} xato (${e?.response?.status ?? e?.code ?? e?.message})`)
    }
  }

  return []
}
