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

  cached = { instance, baseUrl: s.serverUrl, token: s.apiToken }
  return instance
}

export function resetApi(): void {
  cached = null
}
