import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Coffee, Settings as SettingsIcon, Shield, User } from 'lucide-react'
import type { Waiter } from '@shared/types'
import { useSettings } from '@/stores/settings'
import { initials } from '@/lib/format'
import { cn } from '@/lib/cn'
import StatusBar from '@/components/StatusBar'

export default function WaiterSelect(): JSX.Element {
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)

  useEffect(() => {
    void window.afisant.auth.listWaiters().then((list) => {
      setWaiters(list)
      setLoading(false)
    })
  }, [])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-primary/15 text-brand-primary">
            <Coffee size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{settings?.organizationName ?? 'Afisant'}</h1>
            <p className="text-xs text-ink-soft">POS Tizimi · Afitsant paneli</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBar />
          <button
            onClick={() => navigate('/settings')}
            className="btn-ghost h-10 w-10 p-0"
            title="Sozlamalar"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-8 pb-10">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Afitsantni tanlang</h2>
          <p className="mt-1 text-sm text-ink-soft">Tizimga kirish uchun ismingizni tanlang</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card h-44 animate-pulse" />
            ))}
          </div>
        ) : waiters.length === 0 ? (
          <div className="card mx-auto max-w-md p-8 text-center">
            <User className="mx-auto mb-3 text-ink-dim" size={32} />
            <p className="text-sm text-ink-soft">Afitsantlar topilmadi. Sozlamalarda serverga ulanib sinxronlang.</p>
            <button onClick={() => navigate('/settings')} className="btn-primary mx-auto mt-4">
              Sozlamalar
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
                transition={{ delay: idx * 0.03 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  'group relative flex h-44 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-line bg-bg-card p-4 transition-all',
                  'hover:border-brand-success/40 hover:bg-bg-elevated hover:shadow-glow'
                )}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-success/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div
                  className={cn(
                    'grid h-16 w-16 place-items-center rounded-full text-xl font-semibold',
                    w.role === 'super_waiter'
                      ? 'bg-gradient-to-br from-brand-primary to-amber-700 text-black'
                      : 'bg-gradient-to-br from-brand-info/30 to-brand-purple/30 text-ink'
                  )}
                >
                  {initials(w.firstName, w.lastName)}
                </div>
                <div className="text-center">
                  <p className="font-medium leading-tight">
                    {w.firstName} {w.lastName}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-soft">
                    {w.role === 'super_waiter' && <Shield size={10} />}
                    {w.role === 'super_waiter' ? 'Super afitsant' : 'Afitsant'}
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
