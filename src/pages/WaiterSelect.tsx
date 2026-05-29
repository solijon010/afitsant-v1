import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, RefreshCw, Settings, Shield } from 'lucide-react'
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
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#050e05' }}>
      {/* Fon */}
      <img src={loginBg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.55) saturate(1.1)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,10,0,0.65) 0%, rgba(0,8,0,0.45) 40%, rgba(0,10,0,0.72) 100%)' }} />

      {/* ── HEADER ── */}
      <header style={{
        position: 'relative', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 28px',
        background: 'rgba(3,10,3,0.72)',
        borderBottom: '1px solid rgba(245,200,66,0.18)',
      }}>
        {/* Logo + nom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(245,200,66,0.6)', flexShrink: 0, boxShadow: '0 0 12px rgba(245,200,66,0.2)' }}>
            <img src={logoImg} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f5c842', fontFamily: 'Georgia,serif', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.2 }}>
              {settings?.organizationName ?? 'Sohil Choyhona'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <div style={{ width: 16, height: 1, background: 'rgba(245,200,66,0.4)' }} />
              <p style={{ margin: 0, fontSize: 10, color: 'rgba(245,200,66,0.6)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Afitsantni tanlang</p>
            </div>
          </div>
        </div>

        {/* O'ng tugmalar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBar />
          {[
            { icon: <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />, onClick: () => void handleSync(), disabled: syncing, title: 'Yangilash' },
            { icon: <Settings size={15} />, onClick: () => navigate('/settings'), title: 'Sozlamalar' },
            { icon: <LogOut size={15} />, onClick: handleLogout, title: 'Chiqish' },
          ].map((b, i) => (
            <button key={i} onClick={b.onClick} disabled={b.disabled} title={b.title} style={{
              width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(245,200,66,0.2)',
              background: 'rgba(245,200,66,0.07)', color: 'rgba(245,200,66,0.7)',
              cursor: 'pointer', display: 'grid', placeItems: 'center',
              transition: 'all .15s', opacity: b.disabled ? 0.4 : 1,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,200,66,0.15)'; (e.currentTarget as HTMLButtonElement).style.color = '#f5c842' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,200,66,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(245,200,66,0.7)' }}
            >
              {b.icon}
            </button>
          ))}
        </div>
      </header>

      {/* ── KONTENT ── */}
      <main style={{ position: 'relative', zIndex: 10, flex: 1, overflowY: 'auto', padding: '32px 32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: waiters.length === 0 && !loading ? 'center' : 'flex-start' }}>

        {/* Sariq separator */}
        <div style={{ width: '100%', maxWidth: 900, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(245,200,66,0.35))' }} />
          <span style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(245,200,66,0.55)' }}>✦ Kirish ✦</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, rgba(245,200,66,0.35))' }} />
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, width: '100%', maxWidth: 900 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 180, borderRadius: 20, background: 'rgba(245,200,66,0.05)', border: '1px solid rgba(245,200,66,0.1)', animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : waiters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'rgba(245,200,66,0.5)', fontSize: 14, marginBottom: 16 }}>Afitsantlar topilmadi</p>
            <button onClick={() => void handleSync()} disabled={syncing} style={{
              padding: '12px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(180deg,#ffe04d,#f5c000)', color: '#0a1200',
              fontWeight: 800, fontSize: 13, letterSpacing: '0.1em',
            }}>
              <RefreshCw size={14} style={{ display: 'inline', marginRight: 8 }} />
              Sinxronlash
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 14, width: '100%', maxWidth: 900 }}>
            {waiters.map((w) => <WaiterCard key={w.id} waiter={w} onClick={() => navigate(`/pin/${w.id}`)} />)}
          </div>
        )}
      </main>
    </div>
  )
}

function WaiterCard({ waiter, onClick }: { waiter: Waiter; onClick: () => void }): JSX.Element {
  const isSpecial = waiter.role === 'super_waiter' || waiter.role === 'manager'
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 14, padding: '24px 16px',
        borderRadius: 20, cursor: 'pointer', border: 'none',
        background: hovered
          ? 'rgba(245,200,66,0.1)'
          : 'rgba(6,15,6,0.82)',
        outline: `2px solid ${hovered ? 'rgba(245,200,66,0.6)' : isSpecial ? 'rgba(245,200,66,0.25)' : 'rgba(255,255,255,0.07)'}`,
        outlineOffset: -2,
        boxShadow: hovered
          ? '0 12px 36px rgba(0,0,0,0.6), 0 0 20px rgba(245,200,66,0.12)'
          : '0 4px 20px rgba(0,0,0,0.5)',
        transform: hovered ? 'translateY(-4px)' : 'none',
        transition: 'all .2s ease',
        minHeight: 175,
      }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative' }}>
        {isSpecial && (
          <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '1.5px dashed rgba(245,200,66,0.4)' }} />
        )}
        <div style={{
          width: 68, height: 68, borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          fontSize: 22, fontWeight: 800, fontFamily: 'Georgia,serif',
          color: isSpecial ? '#f5c842' : '#e8d5a3',
          background: isSpecial
            ? 'linear-gradient(145deg, rgba(245,200,66,0.18), rgba(245,200,66,0.06))'
            : 'rgba(255,255,255,0.07)',
          border: `2px solid ${isSpecial ? 'rgba(245,200,66,0.55)' : 'rgba(255,255,255,0.15)'}`,
          boxShadow: isSpecial ? '0 0 16px rgba(245,200,66,0.2)' : 'none',
          letterSpacing: '0.04em',
        }}>
          {initials(waiter.firstName, waiter.lastName)}
        </div>
      </div>

      {/* Ism */}
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#e8d5a3', fontFamily: 'Georgia,serif', letterSpacing: '0.04em', lineHeight: 1.3 }}>
          {waiter.firstName}<br />{waiter.lastName}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
          {isSpecial && <Shield size={9} color="#f5c842" />}
          <p style={{ margin: 0, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: isSpecial ? '#f5c842' : 'rgba(255,255,255,0.35)' }}>
            {waiter.role === 'super_waiter' ? 'Super afitsant' : waiter.role === 'manager' ? 'Manager' : 'Afitsant'}
          </p>
        </div>
      </div>
    </button>
  )
}
