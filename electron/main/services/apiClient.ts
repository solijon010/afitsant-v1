import axios, { AxiosInstance } from 'axios'
import { getSettings, setSettings } from './settings'

let cached: { instance: AxiosInstance; baseUrl: string } | null = null

// 401 bo'lganda chaqiriladigan callback (main/index.ts tomonidan o'rnatiladi)
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn
}

export function getApi(): AxiosInstance {
  const s = getSettings()
  if (cached && cached.baseUrl === s.serverUrl) return cached.instance

  const instance = axios.create({
    baseURL: s.serverUrl,
    timeout: 15_000
    // Sarlavhani baked-in qilmaymiz — request interceptor har safar yangi token oladi
  })

  // ── Request interceptor: har so'rovda SQLite dan yangi token o'qiladi ──
  instance.interceptors.request.use((config) => {
    const fresh = getSettings()
    const token = fresh.apiToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    } else {
      // Token yo'q — Authorization sarlavhasini butunlay olib tashlaymiz
      delete config.headers.Authorization
    }
    console.log(`[API] --> ${config.method?.toUpperCase()} ${fresh.serverUrl}${config.url}`, config.data ?? '')
    return config
  })

  // ── Response interceptor: log + 401 handler ──
  instance.interceptors.response.use(
    (response) => {
      console.log(`[API] <-- ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`, response.data)
      return response
    },
    (error) => {
      console.error(
        `[API] ERR ${error.response?.status ?? 'NO_RESP'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`,
        error.response?.data ?? error.message
      )
      if (error.response?.status === 401) {
        // Token muddati tugagan yoki noto'g'ri — tozalab renderer ga xabar beramiz
        setSettings({ apiToken: null })
        resetApi()
        unauthorizedHandler?.()
        console.warn('[API] 401 — token tozalandi, renderer ga qayta-login signali yuborildi')
      }
      return Promise.reject(error)
    }
  )

  cached = { instance, baseUrl: s.serverUrl }
  return cached.instance
}

export function resetApi(): void {
  cached = null
}
