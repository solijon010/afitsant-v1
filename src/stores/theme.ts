import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  dark: boolean
  toggle: () => void
  setDark: (v: boolean) => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      dark: false,
      toggle: () => set((s) => {
        const next = !s.dark
        document.documentElement.classList.toggle('dark', next)
        return { dark: next }
      }),
      setDark: (v) => {
        document.documentElement.classList.toggle('dark', v)
        set({ dark: v })
      },
    }),
    { name: 'theme' }
  )
)

// Sahifa yuklanganda saved theme ni qo'llaymiz
const saved = localStorage.getItem('theme')
if (saved) {
  try {
    const { state } = JSON.parse(saved)
    if (state?.dark) document.documentElement.classList.add('dark')
  } catch {}
}
