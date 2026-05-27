import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut, RefreshCw, Settings, Shield, User } from 'lucide-react'
import { toast } from 'sonner'
import type { Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { initials } from '@/lib/format'
import { cn } from '@/lib/cn'
import StatusBar from '@/components/StatusBar'

export default function WaiterSelect(): JSX.Element {
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const logout = useAuth((s) => s.logout)

  const loadWaiters = (): void => {
    setLoading(true)
    void window.afisant.auth.listWaiters().then((list) => {
      setWaiters(list)
      setLoading(false)
    })
  }

  useEffect(() => {
    loadWaiters()
  }, [])

  const handleSync = async (): Promise<void> => {
    setSyncing(true)
    try {
      const res = await window.afisant.sync.fullPull()
      if (res.ok) {
        toast.success("Ma'lumotlar yangilandi")
        loadWaiters()
      } else {
        toast.error("Serverga ulanib bo'lmadi")
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleLogout = (): void => {
    void window.afisant.auth.logout()
    logout()
    navigate('/server-login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {settings?.organizationName ?? 'POS Tizimi'}
          </h1>
          <p className="text-xs text-ink-soft">Afitsantni tanlang</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBar />
          <button
            onClick={() => void handleSync()}
            disabled={syncing}
            className="btn-ghost h-10 w-10 p-0"
            title="Yangilash"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => navigate('/settings')} className="btn-ghost h-10 w-10 p-0" title="Sozlamalar">
            <Settings size={16} />
          </button>
          <button onClick={handleLogout} className="btn-ghost h-10 w-10 p-0" title="Chiqish">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-8 pb-10">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card h-44 animate-pulse" />
            ))}
          </div>
        ) : waiters.length === 0 ? (
          <div className="card mx-auto max-w-md p-8 text-center">
            <User className="mx-auto mb-3 text-ink-dim" size={32} />
            <p className="text-sm text-ink-soft">
              Afitsantlar topilmadi. Server bilan sinxronlang.
            </p>
            <button
              onClick={() => void handleSync()}
              className="btn-primary mx-auto mt-4"
              disabled={syncing}
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              Sinxronlash
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {waiters.map((w, idx) => (
              <motion.button
                key={w.id}
                onClick={() => navigate(`/pin/${w.id}`)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  'group relative flex h-48 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border p-5 transition-all',
                  'border-line bg-bg-card hover:border-brand-success/40 hover:bg-bg-elevated hover:shadow-glow'
                )}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-success/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div
                  className={cn(
                    'grid h-20 w-20 place-items-center rounded-full text-2xl font-bold shadow-inner',
                    w.role === 'super_waiter'
                      ? 'bg-gradient-to-br from-amber-500 to-amber-700 text-black'
                      : 'bg-gradient-to-br from-brand-info/30 to-brand-purple/30 text-ink'
                  )}
                >
                  {initials(w.firstName, w.lastName)}
                </div>
                <div className="text-center">
                  <p className="font-semibold leading-tight">
                    {w.firstName} {w.lastName}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-soft">
                    {w.role === 'super_waiter' && <Shield size={10} />}
                    {w.role === 'super_waiter' ? 'Super afitsant' : w.role === 'manager' ? 'Manager' : 'Afitsant'}
                  </p>
                  {w.phone && (
                    <p className="mt-0.5 text-[10px] text-ink-dim">{w.phone.slice(-4).padStart(w.phone.length, '•')}</p>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
