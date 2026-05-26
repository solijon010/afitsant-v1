import { create } from 'zustand'
import type { ServerUser, Waiter } from '@shared/types'

interface AuthState {
  waiter: Waiter | null
  shiftStartedAt: number | null
  serverUser: ServerUser | null
  serverToken: string | null
  branchId: string | null
  login: (w: Waiter) => void
  setServerAuth: (user: ServerUser, token: string, branchId: string | null) => void
  logout: () => void
}

export const useAuth = create<AuthState>((set) => ({
  waiter: null,
  shiftStartedAt: null,
  serverUser: null,
  serverToken: null,
  branchId: null,
  login: (w) => set({ waiter: w, shiftStartedAt: Date.now() }),
  setServerAuth: (user, token, branchId) =>
    set({ serverUser: user, serverToken: token, branchId }),
  logout: () =>
    set({ waiter: null, shiftStartedAt: null, serverUser: null, serverToken: null, branchId: null })
}))
