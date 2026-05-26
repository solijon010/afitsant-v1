import { create } from 'zustand'
import type { Settings } from '@shared/types'

interface SettingsState {
  settings: Settings | null
  load: () => Promise<void>
  patch: (p: Partial<Settings>) => Promise<void>
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  load: async () => {
    const s = await window.afisant.settings.get()
    set({ settings: s })
  },
  patch: async (p) => {
    const s = await window.afisant.settings.set(p)
    set({ settings: s })
  }
}))
