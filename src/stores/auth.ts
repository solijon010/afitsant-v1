import { create } from 'zustand'
import type { Waiter } from '@shared/types'

interface AuthState {
  waiter: Waiter | null
  shiftStartedAt: number | null
  login: (w: Waiter) => void
  logout: () => void
}

export const useAuth = create<AuthState>((set) => ({
  waiter: null,
  shiftStartedAt: null,
  login: (w) => set({ waiter: w, shiftStartedAt: Date.now() }),
  logout: () => set({ waiter: null, shiftStartedAt: null })
}))
