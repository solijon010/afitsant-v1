import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import LoginPage from '@/pages/Login'
import BranchSelectPage from '@/pages/BranchSelect'
import WaiterSelect from '@/pages/WaiterSelect'
import PinEntry from '@/pages/PinEntry'
import TablesPage from '@/pages/Tables'
import OrderPage from '@/pages/Order'
import SettingsPage from '@/pages/Settings'

/** JWT tokenning muddati tugamaganligini tekshiradi */
export function isTokenValid(token: string): boolean {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64)) as { exp?: number }
    return !payload.exp || payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

/**
 * Boshlang'ich yo'naltiruvchi — settings yuklanguncha bo'sh ekran ko'rsatadi.
 * Token amal qilsa → /select-waiter, yo'q bo'lsa → /server-login.
 */
function RootRedirect(): JSX.Element {
  const settings = useSettings((s) => s.settings)
  const serverToken = useAuth((s) => s.serverToken)

  // Settings hali yuklanmagan — bo'sh ekran, server-loginni ko'rsatmaymiz
  if (settings === null) return <div className="h-full bg-[#F5F5F4]" />

  const hasToken = serverToken || (settings.apiToken && isTokenValid(settings.apiToken))
  if (hasToken) return <Navigate to="/select-waiter" replace />
  return <Navigate to="/server-login" replace />
}

function RequireAuth({ children }: { children: React.ReactNode }): JSX.Element {
  const waiter = useAuth((s) => s.waiter)
  if (!waiter) return <Navigate to="/select-waiter" replace />
  return <>{children}</>
}

/**
 * Server autentifikatsiyasi talab etadigan sahifalar uchun guard.
 * Settings yuklanmagan bo'lsa — bo'sh ekran ko'rsatadi (server-login flashini oldini oladi).
 */
function RequireServerAuth({ children }: { children: React.ReactNode }): JSX.Element {
  const serverToken = useAuth((s) => s.serverToken)
  const settings = useSettings((s) => s.settings)

  // Settings yuklanmoqda — hech qaerga yo'naltirmaymiz
  if (settings === null) return <div className="h-full bg-[#F5F5F4]" />

  const hasToken = serverToken || (settings.apiToken && isTokenValid(settings.apiToken))
  if (!hasToken) return <Navigate to="/server-login" replace />
  return <>{children}</>
}

export default function App(): JSX.Element {
  const location = useLocation()
  const loadSettings = useSettings((s) => s.load)
  const loadMenu = useMenu((s) => s.load)
  const loadTables = useTables((s) => s.load)
  const waiter = useAuth((s) => s.waiter)
  const settings = useSettings((s) => s.settings)
  const restoreSession = useAuth((s) => s.restoreSession)
  const navigate = useNavigate()
  const sessionRestored = useRef(false)

  useEffect(() => {
    void loadSettings().then(() => {
      void loadMenu()
      void loadTables()
    })
  }, [loadSettings, loadMenu, loadTables])

  // Settings yuklanganida: token haqiqiy bo'lsa → sessionni tiklash
  // Bu bir marta ishga tushadi (sessionRestored ref bilan)
  useEffect(() => {
    if (!settings || sessionRestored.current) return
    sessionRestored.current = true

    if (settings.apiToken && isTokenValid(settings.apiToken)) {
      // Zustand ga token yozamiz — RequireServerAuth uchun kerak
      restoreSession(settings.apiToken, settings.branchId ?? null)
    } else if (settings.apiToken) {
      // Token muddati o'tgan — tozalaymiz
      void window.afisant.settings.set({ apiToken: null, branchId: null })
    }
  }, [settings, restoreSession, navigate])

  useEffect(() => {
    const off = window.afisant.on.sync(({ channel }) => {
      if (channel.startsWith('menu') || channel.startsWith('product') || channel.startsWith('category')) {
        void loadMenu()
      }
      if (channel.startsWith('area') || channel.startsWith('table') || channel.startsWith('order')) {
        void loadTables()
      }
    })
    return () => off()
  }, [loadMenu, loadTables])

  // Internet/socket qayta ulanganda — sync tugagandan keyin ma'lumotlarni yangilaymiz
  useEffect(() => {
    let prevOnline = false
    let reloadTimer: ReturnType<typeof setTimeout> | null = null
    const off = window.afisant.on.syncStatus((s) => {
      if (s.online && !prevOnline) {
        // Sync engine 3 soniya ichida pending orderlarni serverga yuborgandan keyin yuklaymiz
        // (zombie: server hali PENDING, lokal yopilgan holatni oldini olish)
        if (reloadTimer) clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => {
          void loadTables()
          void loadMenu()
        }, 3500)
      }
      prevOnline = s.online
    })
    return () => {
      off()
      if (reloadTimer) clearTimeout(reloadTimer)
    }
  }, [loadTables, loadMenu])

  // Token muddati tugaganda (401) → server-login ga yo'naltiramiz
  useEffect(() => {
    const off = window.afisant.on.sessionExpired(() => {
      useAuth.getState().logout()
      navigate('/server-login', { replace: true })
    })
    return () => off()
  }, [navigate])

  useEffect(() => {
    if (waiter && (location.pathname === '/select-waiter' || location.pathname === '/server-login')) {
      navigate('/tables', { replace: true })
    }
  }, [waiter, location.pathname, navigate])

  return (
    <div className="h-full">
      <Routes location={location}>
          {/* Smart redirect — token bo'lsa select-waiter, yo'q bo'lsa server-login */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />

          <Route path="/server-login" element={<LoginPage />} />
          <Route path="/select-branch" element={<BranchSelectPage />} />
          <Route
            path="/select-waiter"
            element={
              <RequireServerAuth>
                <WaiterSelect />
              </RequireServerAuth>
            }
          />
          <Route
            path="/pin/:waiterId"
            element={
              <RequireServerAuth>
                <PinEntry />
              </RequireServerAuth>
            }
          />
          <Route path="/login" element={<Navigate to="/select-waiter" replace />} />
          <Route
            path="/tables"
            element={
              <RequireAuth>
                <TablesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/order/:tableId"
            element={
              <RequireAuth>
                <OrderPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireServerAuth>
                <SettingsPage />
              </RequireServerAuth>
            }
          />
        </Routes>
    </div>
  )
}
