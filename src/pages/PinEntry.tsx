import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Delete, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useCart } from '@/stores/cart'
import { initials } from '@/lib/format'
import { PIN_LENGTH } from '@/components/PinPad'
import loginBg from '@/assets/manzara-foto.png'

export default function PinEntry(): JSX.Element {
  const { waiterId } = useParams<{ waiterId: string }>()
  const navigate = useNavigate()
  const login = useAuth((s) => s.login)
  const [waiter, setWaiter] = useState<Waiter | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = Number(waiterId)
    void window.afisant.auth.listWaiters().then((list) => {
      const found = list.find((w) => w.id === id) ?? null
      setWaiter(found)
      if (found?.lockedUntil && found.lockedUntil > Date.now()) setLockedUntil(found.lockedUntil)
    })
  }, [waiterId])

  useEffect(() => {
    if (!lockedUntil) return
    const t = setInterval(() => { setNow(Date.now()); if (Date.now() >= lockedUntil) setLockedUntil(null) }, 250)
    return () => clearInterval(t)
  }, [lockedUntil])

  useEffect(() => { containerRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') navigate('/select-waiter')
      if (/^[0-9]$/.test(e.key)) press(e.key)
      if (e.key === 'Backspace') del()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, pin, lockedUntil, busy])

  const lockSecondsLeft = useMemo(() => {
    if (!lockedUntil) return 0
    return Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  }, [lockedUntil, now])

  const submit = async (raw: string): Promise<void> => {
    if (!waiter || busy || lockedUntil) return
    if (raw.length !== PIN_LENGTH) return
    setBusy(true)
    try {
      const res = await window.afisant.auth.verifyPin(waiter.id, raw)
      if (res.ok && res.waiter) {
        login(res.waiter)
        useCart.setState({ orderId: null, tableId: null, lines: [] })
        toast.success(`Xush kelibsiz, ${res.waiter.firstName}!`)
        navigate('/tables', { replace: true })
        return
      }
      setShake(true)
      setTimeout(() => setShake(false), 360)
      setPin('')
      if (res.lockedUntil) { setLockedUntil(res.lockedUntil); toast.error('5 ta xato — 1 daqiqaga bloklandi') }
      else toast.error(res.message ?? "Noto'g'ri PIN", { description: res.attemptsLeft ? `${res.attemptsLeft} urinish qoldi` : undefined })
    } finally { setBusy(false) }
  }

  const press = (d: string): void => {
    if (busy || !!lockedUntil || pin.length >= PIN_LENGTH) return
    const next = pin + d
    setPin(next)
    if (next.length === PIN_LENGTH) void submit(next)
  }

  const del = (): void => { if (!busy) setPin(v => v.slice(0, -1)) }

  const numBtn = (variant: 'default' | 'red' = 'default'): React.CSSProperties => ({
    height: 64, borderRadius: 16,
    fontSize: 22, fontWeight: 700,
    background: variant === 'red'
      ? 'linear-gradient(145deg,#ff5f57,#e53935,#c62828)'
      : 'rgba(255,255,255,0.08)',
    border: `1px solid ${variant === 'red' ? 'rgba(229,57,53,0.4)' : 'rgba(255,255,255,0.1)'}`,
    color: 'white', cursor: 'pointer',
    display: 'grid', placeItems: 'center',
    boxShadow: variant === 'red'
      ? '0 4px 14px rgba(229,57,53,0.5), inset 0 1px 0 rgba(255,255,255,0.25)'
      : 'inset 0 1px 0 rgba(255,255,255,0.08)',
    opacity: (busy || !!lockedUntil) ? 0.4 : 1,
    transition: 'opacity .1s',
    fontFamily: 'Georgia, serif',
  })

  if (!waiter) return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#050e05' }}>
      <img src={loginBg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.7)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{ position: 'relative', zIndex: 10, width: 280, height: 80, borderRadius: 16, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245,200,66,0.2)', animation: 'pulse 1.5s infinite' }} />
    </div>
  )

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#050e05', outline: 'none' }}
    >
      {/* Fon */}
      <img src={loginBg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.72)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)' }} />

      {/* Orqaga */}
      <button
        onClick={() => navigate('/select-waiter')}
        style={{
          position: 'absolute', left: 20, top: 20, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 12,
          background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(245,200,66,0.25)',
          color: 'rgba(245,200,66,0.8)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <ArrowLeft size={14} /> Orqaga
      </button>

      {/* Karta */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 360, padding: '0 20px' }}>
        <div style={{
          background: 'rgba(0,0,0,0.72)',
          border: '1px solid rgba(245,200,66,0.3)',
          borderRadius: 24, overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(245,200,66,0.07)',
        }}>
          {/* Yuqori sariq chiziq */}
          <div style={{ height: 3, background: 'linear-gradient(90deg,transparent,#f5c842 40%,#ffe680 50%,#f5c842 60%,transparent)' }} />

          <div style={{ padding: '28px 24px 28px' }}>
            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '1px dashed rgba(245,200,66,0.25)' }} />
                <motion.div
                  animate={shake ? { x: [-8,8,-6,6,-3,3,0] } : { x: 0 }}
                  transition={{ duration: 0.36 }}
                  style={{
                    width: 76, height: 76, borderRadius: '50%',
                    display: 'grid', placeItems: 'center',
                    fontSize: 26, fontWeight: 800,
                    fontFamily: 'Georgia, serif',
                    color: '#f5c842',
                    background: 'rgba(245,200,66,0.08)',
                    border: '2px solid rgba(245,200,66,0.5)',
                    boxShadow: '0 0 20px rgba(245,200,66,0.15)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {initials(waiter.firstName, waiter.lastName)}
                </motion.div>
              </div>
            </div>

            {/* Ism */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#e8d5a3', fontFamily: 'Georgia,serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {waiter.firstName} {waiter.lastName}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                <div style={{ height: 1, width: 20, background: 'rgba(245,200,66,0.3)' }} />
                {lockedUntil ? (
                  <span style={{ fontSize: 11, color: '#ff5f57', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Lock size={10} /> Bloklangan · {lockSecondsLeft}s
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: 'rgba(245,200,66,0.55)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                    PIN-kodni kiriting
                  </span>
                )}
                <div style={{ height: 1, width: 20, background: 'rgba(245,200,66,0.3)' }} />
              </div>
              {!lockedUntil && (
                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.05em' }}>
                  PIN unutilsa — Sozlamalar → Afitsantlar
                </p>
              )}
            </div>

            {/* PIN nuqtalar */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                const filled = i < pin.length
                return (
                  <div key={i} style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: filled ? '#f5c842' : 'transparent',
                    border: `2px solid ${filled ? '#f5c842' : 'rgba(245,200,66,0.3)'}`,
                    boxShadow: filled ? '0 0 10px rgba(245,200,66,0.6)' : 'none',
                    transition: 'all .15s',
                  }} />
                )
              })}
            </div>

            {/* NumPad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {['1','2','3','4','5','6','7','8','9'].map(n => (
                <button key={n} type="button" disabled={busy || !!lockedUntil} onClick={() => press(n)} style={numBtn()}>{n}</button>
              ))}
              <div />
              <button type="button" disabled={busy || !!lockedUntil} onClick={() => press('0')} style={numBtn()}>0</button>
              <button type="button" disabled={busy || pin.length === 0} onClick={del} style={numBtn('red')}>
                <Delete size={20} />
              </button>
            </div>
          </div>

          {/* Pastki sariq chiziq */}
          <div style={{ height: 2, background: 'linear-gradient(90deg,transparent,#f5c842 40%,#ffe680 50%,#f5c842 60%,transparent)' }} />
        </div>
      </div>
    </div>
  )
}
