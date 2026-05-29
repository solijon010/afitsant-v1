import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut, RefreshCw, Settings, Shield, UtensilsCrossed, Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import type { Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { initials } from '@/lib/format'
import StatusBar from '@/components/StatusBar'
import { cn } from '@/lib/cn'

/* ─── Animatsiya variantlari ─── */
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: 'easeOut' } },
}

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

  useEffect(() => { loadWaiters() }, [])

  const handleSync = async (): Promise<void> => {
    setSyncing(true)
    try {
      const res = await window.afisant.sync.fullPull()
      if (res.ok) { toast.success("Ma'lumotlar yangilandi"); loadWaiters() }
      else toast.error("Serverga ulanib bo'lmadi")
    } finally { setSyncing(false) }
  }

  const handleLogout = (): void => {
    void window.afisant.auth.logout()
    logout()
    navigate('/server-login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col bg-[#F5F5F4]">

      {/* ── HEADER ── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone-100 bg-white px-6 shadow-sm">

        {/* Chap: Logo + nom */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#C2410C]/10">
            <UtensilsCrossed size={18} className="text-[#C2410C]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-900 leading-tight">
              {settings?.organizationName ?? 'Hisobchim POS'}
            </p>
            <p className="text-[11px] text-stone-400 leading-tight">Afitsantni tanlang</p>
          </div>
        </div>

        {/* O'ng: Tugmalar */}
        <div className="flex items-center gap-2">
          <StatusBar />
          <IconButton onClick={() => void handleSync()} disabled={syncing} title="Yangilash">
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          </IconButton>
          <IconButton onClick={() => navigate('/settings')} title="Sozlamalar">
            <Settings size={15} />
          </IconButton>
          <IconButton onClick={handleLogout} title="Chiqish" danger>
            <LogOut size={15} />
          </IconButton>
        </div>
      </header>

      {/* ── KONTENT ── */}
      <main className="flex-1 overflow-y-auto px-8 py-8">

        {/* Sarlavha */}
        <div className="mb-6 flex items-center gap-3">
          <div className="h-[2px] w-6 rounded-full bg-[#C2410C]" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-400">
            Kimsan?
          </h2>
          <div className="flex-1 h-px bg-stone-100" />
        </div>

        {loading ? (
          /* ── Skeleton ── */
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[168px] rounded-2xl bg-stone-100 animate-pulse" />
            ))}
          </div>
        ) : waiters.length === 0 ? (
          /* ── Bo'sh holat ── */
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100">
              <UtensilsCrossed size={28} className="text-stone-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-stone-500">Afitsantlar topilmadi</p>
              <p className="mt-1 text-xs text-stone-400">Serverdan sinxronlash kerak</p>
            </div>
            <button
              onClick={() => void handleSync()}
              disabled={syncing}
              className="btn-primary mt-2"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              Sinxronlash
            </button>
          </div>
        ) : (
          /* ── Afitsantlar grid ── */
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
          >
            {waiters.map((w) => (
              <WaiterCard key={w.id} waiter={w} onClick={() => navigate(`/pin/${w.id}`)} />
            ))}
          </motion.div>
        )}
      </main>
    </div>
  )
}

/* ─── Afitsant kartasi ─── */
function WaiterCard({ waiter, onClick }: { waiter: Waiter; onClick: () => void }): JSX.Element {
  const isSpecial = waiter.role === 'super_waiter' || waiter.role === 'manager'
  const roleLabel =
    waiter.role === 'super_waiter' ? 'Super afitsant' :
    waiter.role === 'manager' ? 'Manager' : 'Afitsant'

  return (
    <motion.button
      variants={cardVariants}
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'group flex flex-col items-center gap-3 rounded-2xl border-2 bg-white px-4 py-5 text-left shadow-card transition-shadow hover:shadow-card-hover',
        isSpecial
          ? 'border-amber-200 hover:border-amber-400'
          : 'border-stone-100 hover:border-stone-300',
      )}
    >
      {/* Avatar */}
      <div className="relative">
        {isSpecial && (
          <div className="absolute -inset-1.5 rounded-full border-2 border-dashed border-amber-300/60" />
        )}
        <div className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold tracking-wide',
          isSpecial
            ? 'bg-amber-50 text-amber-700 ring-2 ring-amber-200'
            : 'bg-stone-100 text-stone-600',
        )}>
          {initials(waiter.firstName, waiter.lastName)}
        </div>
      </div>

      {/* Ism */}
      <div className="w-full text-center">
        <p className="text-sm font-semibold text-stone-800 leading-tight">
          {waiter.firstName}
          {waiter.lastName ? <><br />{waiter.lastName}</> : null}
        </p>
        <div className="mt-2 flex items-center justify-center gap-1">
          {isSpecial && <Shield size={9} className="text-amber-500" />}
          <p className={cn(
            'text-[10px] font-medium uppercase tracking-widest',
            isSpecial ? 'text-amber-500' : 'text-stone-400',
          )}>
            {roleLabel}
          </p>
        </div>
      </div>
    </motion.button>
  )
}

/* ─── Kichik ikon tugma ─── */
function IconButton({
  children, onClick, disabled, title, danger,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  danger?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
        danger
          ? 'border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
          : 'border-stone-100 text-stone-400 hover:bg-stone-50 hover:text-stone-700 hover:border-stone-200',
      )}
    >
      {children}
    </button>
  )
}
