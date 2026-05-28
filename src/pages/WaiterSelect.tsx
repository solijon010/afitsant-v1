import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, RefreshCw, Settings, Shield, User } from 'lucide-react'
import { toast } from 'sonner'
import type { Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { initials } from '@/lib/format'
import StatusBar from '@/components/StatusBar'
import loginBg from '@/assets/manzara-foto.png'
import logoImg from '@/assets/logo.png'

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
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{
        backgroundImage: `url(${loginBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0" style={{ background: 'rgba(8,5,1,0.52)' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.5) 100%)' }} />

      {/* Header */}
      <header
        className="relative z-10 flex items-center justify-between px-8 py-4"
        style={{
          background: 'linear-gradient(180deg, rgba(10,6,1,0.85) 0%, rgba(10,6,1,0.0) 100%)',
          borderBottom: '1px solid rgba(201,169,110,0.15)',
        }}
      >
        {/* Logo + nom */}
        <div className="flex items-center gap-3">
          <div
            className="h-11 w-11 rounded-full overflow-hidden flex-shrink-0"
            style={{ border: '1.5px solid rgba(201,169,110,0.5)', boxShadow: '0 0 12px rgba(201,169,110,0.15)' }}
          >
            <img src={logoImg} alt="logo" className="h-full w-full object-cover" />
          </div>
          <div>
            <h1
              className="text-base font-bold tracking-[0.12em] uppercase leading-tight"
              style={{ color: '#e8d5a3', fontFamily: 'Georgia, serif', textShadow: '0 0 20px rgba(201,169,110,0.3)' }}
            >
              {settings?.organizationName ?? 'Sohil Choyhona'}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="h-px w-4" style={{ background: '#c9a96e55' }} />
              <p className="text-[10px] tracking-[0.2em] uppercase" style={{ color: '#c9a96e88' }}>
                Afitsantni tanlang
              </p>
            </div>
          </div>
        </div>

        {/* Tugmalar */}
        <div className="flex items-center gap-2">
          <StatusBar />
          <RetroIconBtn title="Yangilash" onClick={() => void handleSync()} disabled={syncing}>
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          </RetroIconBtn>
          <RetroIconBtn title="Sozlamalar" onClick={() => navigate('/settings')}>
            <Settings size={15} />
          </RetroIconBtn>
          <RetroIconBtn title="Chiqish" onClick={handleLogout}>
            <LogOut size={15} />
          </RetroIconBtn>
        </div>
      </header>

      {/* Sarlavha chizig'i */}
      <div className="relative z-10 flex items-center gap-4 px-8 py-3">
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(201,169,110,0.4), transparent)' }} />
        <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(201,169,110,0.5)' }}>✦ Kirish ✦</span>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, rgba(201,169,110,0.4), transparent)' }} />
      </div>

      {/* Asosiy kontent */}
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-8 pb-10">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-48 rounded-2xl animate-pulse"
                style={{ background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.15)' }}
              />
            ))}
          </div>
        ) : waiters.length === 0 ? (
          <div
            className="mx-auto max-w-md rounded-3xl p-8 text-center"
            style={{
              background: 'rgba(15,9,2,0.88)',
              border: '1px solid rgba(201,169,110,0.25)',
              boxShadow: '0 0 40px rgba(0,0,0,0.5)',
            }}
          >
            <User className="mx-auto mb-3" size={32} style={{ color: 'rgba(201,169,110,0.4)' }} />
            <p className="text-sm" style={{ color: 'rgba(201,169,110,0.7)' }}>
              Afitsantlar topilmadi. Server bilan sinxronlang.
            </p>
            <button
              onClick={() => void handleSync()}
              disabled={syncing}
              className="mx-auto mt-4 flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold tracking-widest uppercase disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #c9a96e, #e8d09a)',
                color: '#1a0f02',
                boxShadow: '0 4px 16px rgba(201,169,110,0.3)',
              }}
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              Sinxronlash
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {waiters.map((w) => (
              <WaiterCard key={w.id} waiter={w} onClick={() => navigate(`/pin/${w.id}`)} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function WaiterCard({ waiter, onClick }: { waiter: Waiter; onClick: () => void }): JSX.Element {
  const isSpecial = waiter.role === 'super_waiter' || waiter.role === 'manager'

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center justify-center gap-3 rounded-2xl p-5 transition-all active:scale-95"
      style={{
        background: 'linear-gradient(160deg, rgba(28,16,4,0.92), rgba(14,8,1,0.95))',
        border: '1px solid rgba(201,169,110,0.22)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(201,169,110,0.08)',
        minHeight: 180,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        el.style.borderColor = 'rgba(201,169,110,0.55)'
        el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(201,169,110,0.12), inset 0 1px 0 rgba(201,169,110,0.15)'
        el.style.transform = 'translateY(-3px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        el.style.borderColor = 'rgba(201,169,110,0.22)'
        el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(201,169,110,0.08)'
        el.style.transform = 'translateY(0)'
      }}
    >
      {/* Avatar */}
      <div className="relative">
        <div className="absolute -inset-2 rounded-full" style={{ border: '1px dashed rgba(201,169,110,0.2)' }} />
        <div
          className="relative grid h-[68px] w-[68px] place-items-center rounded-full text-xl font-bold"
          style={{
            background: isSpecial
              ? 'linear-gradient(145deg, rgba(201,169,110,0.2), rgba(201,169,110,0.08))'
              : 'linear-gradient(145deg, rgba(201,169,110,0.1), rgba(201,169,110,0.04))',
            border: isSpecial ? '2px solid rgba(201,169,110,0.6)' : '1.5px solid rgba(201,169,110,0.3)',
            color: '#e8d5a3',
            fontFamily: 'Georgia, serif',
            boxShadow: isSpecial ? '0 0 16px rgba(201,169,110,0.2)' : 'none',
          }}
        >
          {initials(waiter.firstName, waiter.lastName)}
        </div>
      </div>

      {/* Ism */}
      <div className="text-center">
        <p
          className="font-bold leading-tight tracking-wide"
          style={{ color: '#e8d5a3', fontFamily: 'Georgia, serif', fontSize: 14 }}
        >
          {waiter.firstName} {waiter.lastName}
        </p>
        <p
          className="mt-1.5 inline-flex items-center gap-1 text-[10px] tracking-[0.18em] uppercase"
          style={{ color: isSpecial ? '#c9a96e' : 'rgba(201,169,110,0.5)' }}
        >
          {isSpecial && <Shield size={9} />}
          {waiter.role === 'super_waiter' ? 'Super afitsant' : waiter.role === 'manager' ? 'Manager' : 'Afitsant'}
        </p>
      </div>
    </button>
  )
}

function RetroIconBtn({ children, title, onClick, disabled }: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="grid h-9 w-9 place-items-center rounded-xl transition-all disabled:opacity-40"
      style={{
        background: 'rgba(201,169,110,0.08)',
        border: '1px solid rgba(201,169,110,0.2)',
        color: 'rgba(201,169,110,0.7)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,169,110,0.16)'
        ;(e.currentTarget as HTMLButtonElement).style.color = '#e8d5a3'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,169,110,0.08)'
        ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(201,169,110,0.7)'
      }}
    >
      {children}
    </button>
  )
}
