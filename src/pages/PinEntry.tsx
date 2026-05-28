import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Lock } from 'lucide-react'
import { toast } from 'sonner'
import type { Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useCart } from '@/stores/cart'
import { initials } from '@/lib/format'
import PinPad, { PIN_LENGTH } from '@/components/PinPad'
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
      if (found?.lockedUntil && found.lockedUntil > Date.now()) {
        setLockedUntil(found.lockedUntil)
      }
    })
  }, [waiterId])

  useEffect(() => {
    if (!lockedUntil) return
    const t = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= lockedUntil) setLockedUntil(null)
    }, 250)
    return () => clearInterval(t)
  }, [lockedUntil])

  useEffect(() => { containerRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') navigate('/select-waiter')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

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
      if (res.lockedUntil) {
        setLockedUntil(res.lockedUntil)
        toast.error('5 ta xato — 1 daqiqaga bloklandi')
      } else {
        toast.error(res.message ?? "Noto'g'ri PIN", {
          description: res.attemptsLeft ? `${res.attemptsLeft} urinish qoldi` : undefined
        })
      }
    } finally {
      setBusy(false)
    }
  }

  if (!waiter) {
    return (
      <div
        className="relative grid h-full place-items-center"
        style={{ backgroundImage: `url(${loginBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0" style={{ background: 'rgba(8,5,1,0.55)' }} />
        <div className="relative z-10 h-24 w-72 rounded-2xl animate-pulse" style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.2)' }} />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="relative flex h-full flex-col items-center justify-center px-6 outline-none overflow-hidden"
      style={{
        backgroundImage: `url(${loginBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0" style={{ background: 'rgba(8,5,1,0.48)' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)' }} />

      {/* Orqaga tugmasi */}
      <button
        onClick={() => navigate('/select-waiter')}
        className="absolute left-6 top-6 z-20 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all"
        style={{
          background: 'rgba(201,169,110,0.1)',
          border: '1px solid rgba(201,169,110,0.3)',
          color: '#e8d5a3',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,169,110,0.18)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,169,110,0.1)' }}
      >
        <ArrowLeft size={14} /> Orqaga
      </button>

      {/* Karta */}
      <div className="relative z-10 w-full max-w-[360px]">
        <div
          className="relative rounded-3xl p-[1px]"
          style={{
            background: 'linear-gradient(145deg, #c9a96e, #6b4c1e, #e8d09a, #6b4c1e, #c9a96e)',
            boxShadow: '0 0 60px rgba(201,169,110,0.2), 0 32px 80px rgba(0,0,0,0.65)',
          }}
        >
          <div
            className="rounded-3xl overflow-hidden"
            style={{ background: 'linear-gradient(175deg, #1c1004 0%, #110a02 40%, #0d0701 100%)' }}
          >
            {/* Yuqori chiziq */}
            <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #c9a96e 30%, #f0dc9a 50%, #c9a96e 70%, transparent)' }} />

            <div className="flex flex-col items-center px-8 pt-7 pb-8">
              {/* Avatar */}
              <div className="relative mb-1">
                <div className="absolute -inset-2.5 rounded-full" style={{ border: '1px dashed rgba(201,169,110,0.22)' }} />
                <div className="absolute -inset-1 rounded-full" style={{ border: '1px solid rgba(201,169,110,0.15)' }} />
                <div
                  className="relative grid h-[80px] w-[80px] place-items-center rounded-full text-2xl font-bold"
                  style={{
                    background: 'linear-gradient(145deg, #2a1a06, #1a0f02)',
                    border: '2px solid rgba(201,169,110,0.55)',
                    color: '#e8d5a3',
                    boxShadow: '0 0 20px rgba(201,169,110,0.2)',
                    fontFamily: 'Georgia, serif',
                    letterSpacing: '0.05em',
                  }}
                >
                  {initials(waiter.firstName, waiter.lastName)}
                </div>
              </div>

              {/* Ism */}
              <h2
                className="mt-4 text-[20px] font-bold tracking-[0.08em] uppercase"
                style={{
                  color: '#e8d5a3',
                  fontFamily: 'Georgia, serif',
                  textShadow: '0 0 30px rgba(201,169,110,0.4)',
                }}
              >
                {waiter.firstName} {waiter.lastName}
              </h2>

              {/* Status */}
              <div className="mt-2 flex items-center gap-2">
                {lockedUntil ? (
                  <span className="flex items-center gap-1.5 text-xs tracking-widest uppercase" style={{ color: '#e87070' }}>
                    <Lock size={11} /> Bloklangan · {lockSecondsLeft}s
                  </span>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="h-px w-6" style={{ background: '#c9a96e44' }} />
                    <span className="text-[10px] tracking-[0.25em] uppercase" style={{ color: '#c9a96e88' }}>
                      PIN-kodni kiriting
                    </span>
                    <div className="h-px w-6" style={{ background: '#c9a96e44' }} />
                  </div>
                )}
              </div>

              {!lockedUntil && (
                <p className="mt-1 text-[10px] tracking-wider" style={{ color: 'rgba(201,169,110,0.4)' }}>
                  PIN unutilsa — Sozlamalar → Afitsantlar
                </p>
              )}

              {/* Separator */}
              <div className="flex items-center gap-2 w-full mt-5 mb-1">
                <div className="flex-1 h-px" style={{ background: 'rgba(201,169,110,0.15)' }} />
                <span style={{ color: 'rgba(201,169,110,0.3)', fontSize: 10 }}>◆ ◆ ◆</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(201,169,110,0.15)' }} />
              </div>

              {/* PIN pad */}
              <PinPad
                pin={pin}
                onChange={setPin}
                disabled={!!lockedUntil || busy}
                shake={shake}
                onSubmit={(raw) => void submit(raw)}
                retro
              />
            </div>

            {/* Pastki chiziq */}
            <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #c9a96e 30%, #f0dc9a 50%, #c9a96e 70%, transparent)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
