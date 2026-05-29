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

const G = '#f5c842'
const G2 = '#d4a200'
const G3 = '#b38a00'

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
  const disabled = busy || !!lockedUntil

  if (!waiter) return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#050e05' }}>
      <img src={loginBg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.7)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
    </div>
  )

  return (
    <div ref={containerRef} tabIndex={-1} style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#050e05', outline: 'none' }}>
      {/* Fon */}
      <img src={loginBg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.65)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.52)' }} />

      {/* ← Orqaga — yashil iOS tugma */}
      <button
        onClick={() => navigate('/select-waiter')}
        style={{
          position: 'absolute', left: 20, top: 20, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', borderRadius: 14, border: 'none',
          background: `linear-gradient(145deg, #ffe04d, ${G}, ${G3})`,
          boxShadow: `0 6px 18px rgba(245,200,66,0.5), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.15)`,
          color: '#0a1200',
          color: 'white', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '0.04em',
        }}
      >
        <ArrowLeft size={15} strokeWidth={2.5} />
        Orqaga
      </button>

      {/* Karta */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 340, padding: '0 16px' }}>
        <div style={{
          background: 'rgba(0,0,0,0.78)',
          border: `1px solid rgba(34,197,94,0.35)`,
          borderRadius: 24, overflow: 'hidden',
          boxShadow: `0 24px 60px rgba(0,0,0,0.75), 0 0 0 1px rgba(34,197,94,0.08)`,
        }}>
          {/* Yuqori yashil chiziq */}
          <div style={{ height: 3, background: `linear-gradient(90deg,transparent,${G2} 35%,${G} 50%,${G2} 65%,transparent)` }} />

          <div style={{ padding: '26px 20px 26px' }}>

            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', inset: -7, borderRadius: '50%', border: `1px dashed rgba(34,197,94,0.3)` }} />
                <motion.div
                  animate={shake ? { x: [-8,8,-6,6,-3,3,0] } : { x: 0 }}
                  transition={{ duration: 0.36 }}
                  style={{
                    width: 74, height: 74, borderRadius: '50%',
                    display: 'grid', placeItems: 'center',
                    fontSize: 24, fontWeight: 800, fontFamily: 'Georgia,serif',
                    color: G, letterSpacing: '0.05em',
                    background: `rgba(34,197,94,0.1)`,
                    border: `2px solid rgba(34,197,94,0.6)`,
                    boxShadow: `0 0 20px rgba(34,197,94,0.2)`,
                  }}
                >
                  {initials(waiter.firstName, waiter.lastName)}
                </motion.div>
              </div>
            </div>

            {/* Ism */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'white', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {waiter.firstName} {waiter.lastName}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                <div style={{ height: 1, width: 18, background: `rgba(34,197,94,0.3)` }} />
                {lockedUntil ? (
                  <span style={{ fontSize: 11, color: '#ff5f57', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Lock size={10} /> Bloklangan · {lockSecondsLeft}s
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: `rgba(34,197,94,0.65)`, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                    PIN-kodni kiriting
                  </span>
                )}
                <div style={{ height: 1, width: 18, background: `rgba(34,197,94,0.3)` }} />
              </div>
              {!lockedUntil && (
                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>
                  PIN unutilsa — Sozlamalar → Afitsantlar
                </p>
              )}
            </div>

            {/* PIN nuqtalar */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 22 }}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                const filled = i < pin.length
                return (
                  <div key={i} style={{
                    width: 13, height: 13, borderRadius: '50%',
                    background: filled ? G : 'transparent',
                    border: `2px solid ${filled ? G : 'rgba(34,197,94,0.35)'}`,
                    boxShadow: filled ? `0 0 10px rgba(34,197,94,0.7)` : 'none',
                    transition: 'all .15s',
                  }} />
                )
              })}
            </div>

            {/* NumPad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
              {['1','2','3','4','5','6','7','8','9'].map(n => (
                <button key={n} type="button" disabled={disabled} onClick={() => press(n)}
                  style={{
                    height: 60, borderRadius: 14,
                    fontSize: 22, fontWeight: 700, fontFamily: 'Georgia,serif',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'white', cursor: 'pointer',
                    display: 'grid', placeItems: 'center',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                    opacity: disabled ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,200,66,0.15)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,200,66,0.5)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.15)' }}
                >
                  {n}
                </button>
              ))}
              <div />
              <button type="button" disabled={disabled} onClick={() => press('0')}
                style={{
                  height: 60, borderRadius: 14,
                  fontSize: 22, fontWeight: 700, fontFamily: 'Georgia,serif',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'white', cursor: 'pointer',
                  display: 'grid', placeItems: 'center',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                  opacity: disabled ? 0.4 : 1,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,197,94,0.18)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(34,197,94,0.5)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.15)' }}
              >
                0
              </button>
              <button type="button" disabled={busy || pin.length === 0} onClick={del}
                style={{
                  height: 60, borderRadius: 14,
                  background: 'linear-gradient(145deg,#ff5f57,#e53935,#c62828)',
                  border: '1px solid rgba(229,57,53,0.4)',
                  color: 'white', cursor: 'pointer',
                  display: 'grid', placeItems: 'center',
                  boxShadow: '0 4px 14px rgba(229,57,53,0.5), inset 0 1px 0 rgba(255,255,255,0.25)',
                  opacity: (busy || pin.length === 0) ? 0.4 : 1,
                }}
              >
                <Delete size={20} />
              </button>
            </div>
          </div>

          {/* Pastki yashil chiziq */}
          <div style={{ height: 2, background: `linear-gradient(90deg,transparent,${G2} 35%,${G} 50%,${G2} 65%,transparent)` }} />
        </div>
      </div>
    </div>
  )
}
