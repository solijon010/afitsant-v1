import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import WaiterSelect from '@/pages/WaiterSelect'
import PinEntry from '@/pages/PinEntry'
import TablesPage from '@/pages/Tables'
import OrderPage from '@/pages/Order'
import SettingsPage from '@/pages/Settings'

function RequireAuth({ children }: { children: React.ReactNode }): JSX.Element {
  const waiter = useAuth((s) => s.waiter)
  if (!waiter) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App(): JSX.Element {
  const location = useLocation()
  const loadSettings = useSettings((s) => s.load)
  const loadMenu = useMenu((s) => s.load)
  const loadTables = useTables((s) => s.load)
  const navigate = useNavigate()
  const waiter = useAuth((s) => s.waiter)

  useEffect(() => {
    void loadSettings()
    void loadMenu()
    void loadTables()
    const off = window.afisant.on.sync(({ channel }) => {
      if (channel.startsWith('menu') || channel.startsWith('product') || channel.startsWith('category')) {
        void loadMenu()
      }
      if (channel.startsWith('area') || channel.startsWith('table')) {
        void loadTables()
      }
      if (channel.startsWith('order')) {
        void loadTables()
      }
    })
    return () => off()
  }, [loadSettings, loadMenu, loadTables])

  useEffect(() => {
    if (waiter && (location.pathname === '/login' || location.pathname === '/pin')) {
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
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<WaiterSelect />} />
          <Route path="/pin/:waiterId" element={<PinEntry />} />
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
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}
