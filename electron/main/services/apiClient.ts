import axios, { AxiosInstance } from 'axios'
import { getSettings } from './settings'

let cached: { instance: AxiosInstance; baseUrl: string; token: string | null } | null = null

export function getApi(): AxiosInstance {
  const s = getSettings()
  if (cached && cached.baseUrl === s.serverUrl && cached.token === s.apiToken) return cached.instance

  const instance = axios.create({
    baseURL: s.serverUrl,
    timeout: 15_000,
    headers: s.apiToken ? { Authorization: `Bearer ${s.apiToken}` } : {}
  })

  instance.interceptors.request.use((config) => {
    console.log(`[API] --> ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, config.data ?? '')
    return config
  })

  instance.interceptors.response.use(
    (response) => {
      console.log(`[API] <-- ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`, response.data)
      return response
    },
    (error) => {
      console.error(`[API] ERR ${error.response?.status ?? 'NO_RESP'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, error.response?.data ?? error.message)
      return Promise.reject(error)
    }
  )

  cached = { instance, baseUrl: s.serverUrl, token: s.apiToken }
  return instance
}

export function resetApi(): void {
  cached = null
}
