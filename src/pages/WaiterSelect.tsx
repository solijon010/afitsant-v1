import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, RefreshCw, Settings, Shield, User } from 'lucide-react'
import { toast } from 'sonner'
import type { Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import { initials } from '@/lib/format'
import StatusBar from '@/components/StatusBar'
import { cn } from '@/lib/cn'
import hisobchimLogo from '@/assets/logo.png'


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
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const autoSyncDone = useRef(false)
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const logout = useAuth((s) => s.logout)
  const loadMenu = useMenu((s) => s.load)
  const loadTables = useTables((s) => s.load)

  const loadWaiters = (): void => {
    setLoading(true)
    void window.afisant.auth.listWaiters().then((list) => {
      setWaiters(sortWaiters(list))
      setLoading(false)
    })
  }

  const handleSync = async (): Promise<void> => {
    setSyncing(true)
    setSyncStatus('syncing')
    try {
      const res = await window.afisant.sync.fullPull()
      if (res.ok) {
        autoSyncDone.current = true
        setSyncStatus('done')
        toast.success(`Sinxronlandi ✓ — kategoriyalar: ${res.counts?.categories ?? 0}, mahsulotlar: ${res.counts?.products ?? 0}, xonalar: ${res.counts?.tables ?? 0}`)
        loadWaiters()
        void loadMenu()
        void loadTables()
      } else {
        setSyncStatus('error')
        toast.error("Serverga ulanib bo'lmadi")
      }
    } catch (e: any) {
      setSyncStatus('error')
      toast.error('Sinxronlash xatosi', { description: e?.message })
    } finally {
      setSyncing(false)
    }
  }

  // Ochilganda bir marta avtomatik sinxronlaymiz (session boshida)
  useEffect(() => {
    loadWaiters()
    if (!autoSyncDone.current) {
      void handleSync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = async (): Promise<void> => {
    await window.afisant.auth.logout()   // DB dagi tokenni o'chiradi
    logout()                              // Zustand state ni tozalaydi
    navigate('/server-login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col" style={{ background: '#D1CFD0' }}>

      {/* ── Sinxronlash banneri ── */}
      {syncStatus === 'syncing' && (
        <div className="flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-700 font-medium">
          <RefreshCw size={14} className="animate-spin shrink-0" />
          Ma'lumotlar serverdan yuklanmoqda — xonalar va mahsulotlar yangilanmoqda…
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="flex h-16 shrink-0 items-center justify-between px-6" style={{ background: '#1E2C46', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>

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
            <p className="text-sm font-semibold leading-tight" style={{ color: '#ffffff' }}>
              {settings?.organizationName ?? 'Hisobchim POS'}
            </p>
            <p className="text-[11px] leading-tight" style={{ color: 'rgba(255,255,255,0.55)' }}>Afitsantni tanlang</p>
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
          <IconButton onClick={() => void handleLogout()} title="Chiqish" danger>
            <LogOut size={15} />
          </IconButton>
        </div>
      </header>

      {/* ── KONTENT ── */}
      <main className="flex-1 overflow-y-auto" style={{ padding: 'clamp(12px, 3vw, 32px)' }}>

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
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(180px, 22vw, 280px), 1fr))' }}
          >
            {waiters.map((w) => (
              <WaiterCard key={w.id} waiter={w} onClick={() => navigate(`/pin/${w.id}`)} />
            ))}
          </div>
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

  const avatarGradient = isSpecial
    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
    : 'linear-gradient(135deg, #3b82f6, #2563eb)'

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 12, padding: 'clamp(16px, 2.5vw, 28px) clamp(12px, 2vw, 24px)',
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #f1f5f9',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        cursor: 'pointer', textAlign: 'center', width: '100%',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 88, height: 88, borderRadius: '50%',
        background: avatarGradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: isSpecial
          ? '0 8px 24px rgba(245,158,11,0.4)'
          : '0 8px 24px rgba(37,99,235,0.35)',
      }}>
        <User size={38} color="#ffffff" strokeWidth={1.8} />
      </div>

      {/* Ism */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>
          {fullName || '—'}
        </p>

        {/* Check icon */}
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: isSpecial ? '#f59e0b' : '#2563eb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Role badge */}
        <div style={{
          padding: '5px 16px', borderRadius: 99,
          background: 'rgba(0,0,0,0.06)',
          fontSize: 11, fontWeight: 700,
          color: isSpecial ? '#d97706' : '#64748b',
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          {isSpecial && <Shield size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />}
          {roleLabel}
        </div>
      </div>
    </button>
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
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 10,
        border: `1px solid ${danger ? 'rgba(255,100,100,0.3)' : 'rgba(255,255,255,0.15)'}`,
        background: 'rgba(255,255,255,0.08)',
        color: danger ? '#f87171' : 'rgba(255,255,255,0.75)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
