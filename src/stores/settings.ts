import { create } from 'zustand'
import type { Settings } from '@shared/types'
import { setImageServerUrl } from '@/lib/imageCache'

interface SettingsState {
  settings: Settings | null
  load: () => Promise<void>
  patch: (p: Partial<Settings>) => Promise<void>
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  load: async () => {
    const s = await window.afisant.settings.get()
    setImageServerUrl(s.serverUrl)
    set({ settings: s })
  },
  patch: async (p) => {
    const s = await window.afisant.settings.set(p)
    setImageServerUrl(s.serverUrl)
    set({ settings: s })
  }
}))
