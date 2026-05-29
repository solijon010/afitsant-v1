import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut, RefreshCw, Settings, Shield } from 'lucide-react'
import { toast } from 'sonner'
import type { Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { initials } from '@/lib/format'
import StatusBar from '@/components/StatusBar'
import { cn } from '@/lib/cn'
import hisobchimLogo from '@/assets/logo.png'

/* ─── Animatsiya variantlari ─── */
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: 'easeOut' } },
}

/* Afitsantlarni yaratilish vaqti bo'yicha tartiblaymiz (birinchi yaratilgan — birinchida) */
function sortWaiters(list: Waiter[]): Waiter[] {
  return [...list].sort((a, b) => {
    // Manager/super_waiter yuqorida tursin
    const rankA = a.role === 'manager' ? 0 : a.role === 'super_waiter' ? 1 : 2
    const rankB = b.role === 'manager' ? 0 : b.role === 'super_waiter' ? 1 : 2
    if (rankA !== rankB) return rankA - rankB
    // Bir xil darajada — yaratilish vaqti bo'yicha (kichik id = avval yaratilgan)
    return a.createdAt - b.createdAt
  })
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
      setWaiters(sortWaiters(list))
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
    // Faqat Zustand state ni tozalaymiz — DB dagi token saqlanib qoladi
    // (keyingi app ishga tushishida avtomatik login uchun)
    logout()
    // WaiterSelect da qolamiz — server-login ga o'tmaymiz
  }

  return (
    <div className="flex h-full flex-col bg-[#F5F5F4]">

      {/* ── HEADER ── */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-stone-100 bg-white px-6 shadow-sm">

        {/* Chap: Logo + nom */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm border border-stone-100">
            <img
              src={hisobchimLogo}
              alt="Hisobchim"
              className="h-10 w-10 object-contain"
            />
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

        {loading ? (
          /* ── Skeleton ── */
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[260px] rounded-2xl bg-stone-100 animate-pulse" />
            ))}
          </div>
        ) : waiters.length === 0 ? (
          /* ── Bo'sh holat ── */
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100">
              <img src={hisobchimLogo} alt="" className="h-10 w-10 object-contain opacity-30" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-stone-500">Afitsantlar topilmadi</p>
              <p className="mt-1 text-xs text-stone-400">Serverdan sinxronlash kerak</p>
            </div>
            <button onClick={() => void handleSync()} disabled={syncing} className="btn-primary mt-2">
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
            className="grid gap-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
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

  /* To'liq ism: Familiya Ismi — bir qatorda */
  const fullName = [waiter.lastName, waiter.firstName].filter(Boolean).join(' ')

  return (
    <motion.button
      variants={cardVariants}
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -3 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.14 }}
      className={cn(
        'group flex flex-col items-center gap-5 rounded-2xl border-2 bg-white px-6 py-8 text-left shadow-card transition-shadow hover:shadow-card-hover',
        isSpecial
          ? 'border-amber-200 hover:border-amber-400'
          : 'border-stone-100 hover:border-stone-300',
      )}
    >
      {/* Avatar */}
      <div className="relative mt-1">
        {isSpecial && (
          <div className="absolute -inset-3 rounded-full border-2 border-dashed border-amber-300/70" />
        )}
        <div className={cn(
          'flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold tracking-wide',
          isSpecial
            ? 'bg-amber-50 text-amber-700 ring-2 ring-amber-300'
            : 'bg-stone-100 text-stone-600',
        )}>
          {initials(waiter.firstName, waiter.lastName)}
        </div>
      </div>

      {/* Ism (Familiya Ismi — bir qatorda) */}
      <div className="w-full text-center">
        <p className="text-[17px] font-bold text-stone-800 leading-snug">
          {fullName || '—'}
        </p>

        {/* Role badge */}
        <div className={cn(
          'mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5',
          isSpecial ? 'bg-amber-50' : 'bg-stone-50',
        )}>
          {isSpecial && <Shield size={11} className="text-amber-500 shrink-0" />}
          <span className={cn(
            'text-[11px] font-bold uppercase tracking-[0.15em]',
            isSpecial ? 'text-amber-600' : 'text-stone-400',
          )}>
            {roleLabel}
          </span>
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
