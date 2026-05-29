import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
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
function isTokenValid(token: string): boolean {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64)) as { exp?: number }
    return !payload.exp || payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

function RequireAuth({ children }: { children: React.ReactNode }): JSX.Element {
  const waiter = useAuth((s) => s.waiter)
  if (!waiter) return <Navigate to="/select-waiter" replace />
  return <>{children}</>
}

function RequireServerAuth({ children }: { children: React.ReactNode }): JSX.Element {
  const serverToken = useAuth((s) => s.serverToken)
  const settings = useSettings((s) => s.settings)
  const hasToken = serverToken || settings?.apiToken
  if (!hasToken) return <Navigate to="/server-login" replace />
  return <>{children}</>
}

export default function App(): JSX.Element {
  const location = useLocation()
  const loadSettings = useSettings((s) => s.load)
  const loadMenu = useMenu((s) => s.load)
  const loadTables = useTables((s) => s.load)
  const navigate = useNavigate()
  const waiter = useAuth((s) => s.waiter)
  const settings = useSettings((s) => s.settings)
  const restoreSession = useAuth((s) => s.restoreSession)
  const initialAutoLoginDone = useRef(false)

  useEffect(() => {
    void loadSettings().then(() => {
      void loadMenu()
      void loadTables()
    })
  }, [loadSettings, loadMenu, loadTables])

  useEffect(() => {
    // Settings hali yuklanmagan bo'lsa yoki allaqachon ishlov berilgan bo'lsa — o'tkazib yubor
    if (!settings || initialAutoLoginDone.current) return
    initialAutoLoginDone.current = true

    if (settings.apiToken && isTokenValid(settings.apiToken)) {
      // Token hali amal qiladi — server loginni o'tkazib, PIN ekraniga o'tish
      restoreSession(settings.apiToken, settings.branchId ?? null)
      navigate('/select-waiter', { replace: true })
    } else if (settings.apiToken) {
      // Token muddati o'tgan — tozalab, server loginni ko'rsatish
      void window.afisant.settings.set({ apiToken: null, branchId: null })
    }
  }, [settings, navigate, restoreSession])

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

  useEffect(() => {
    if (waiter && (location.pathname === '/select-waiter' || location.pathname === '/server-login')) {
      navigate('/tables', { replace: true })
    }
  }, [waiter, location.pathname, navigate])

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18 }}
        className="h-full"
      >
        <Routes location={location}>
          <Route path="/" element={<Navigate to="/server-login" replace />} />
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
          <Route path="*" element={<Navigate to="/server-login" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}
