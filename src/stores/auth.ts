import { create } from 'zustand'
import type { ServerUser, Waiter } from '@shared/types'

interface AuthState {
  waiter: Waiter | null
  shiftStartedAt: number | null
  serverUser: ServerUser | null
  serverToken: string | null
  branchId: string | null
  login: (w: Waiter) => void
  /** Full login from the server — stores user info + token */
  setServerAuth: (user: ServerUser, token: string, branchId: string | null) => void
  /** Restores token from persisted settings on cold start — no user info available */
  restoreSession: (token: string, branchId: string | null) => void
  /** Faqat afitsantni chiqaradi — server token saqlanib qoladi */
  logoutWaiter: () => void
  /** To'liq chiqish — token ham tozalanadi (server-login ga yo'naltirish uchun) */
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
  restoreSession: (token, branchId) =>
    set({ serverToken: token, branchId }),
  logoutWaiter: () =>
    set({ waiter: null, shiftStartedAt: null }),
  logout: () =>
    set({ waiter: null, shiftStartedAt: null, serverUser: null, serverToken: null, branchId: null })
}))
