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
    <div className="flex h-full flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-line bg-bg-card px-8 py-5 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-ink tracking-tight">
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
              <div key={i} className="h-48 rounded-2xl bg-bg-card animate-pulse border border-line" />
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
                whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  'group flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border p-5 transition-colors',
                  'border-line bg-white shadow-card hover:border-brand-primary/30 hover:shadow-card-hover'
                )}
              >
                <div
                  className={cn(
                    'grid h-20 w-20 place-items-center rounded-full text-2xl font-bold',
                    w.role === 'super_waiter' || w.role === 'manager'
                      ? 'bg-brand-primary/10 text-brand-primary ring-2 ring-brand-primary/20'
                      : 'bg-bg-soft text-ink ring-2 ring-line'
                  )}
                >
                  {initials(w.firstName, w.lastName)}
                </div>
                <div className="text-center">
                  <p className="font-semibold leading-tight text-ink">
                    {w.firstName} {w.lastName}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-soft">
                    {(w.role === 'super_waiter' || w.role === 'manager') && (
                      <Shield size={10} className="text-brand-primary" />
                    )}
                    {w.role === 'super_waiter'
                      ? 'Super afitsant'
                      : w.role === 'manager'
                        ? 'Manager'
                        : 'Afitsant'}
                  </p>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
