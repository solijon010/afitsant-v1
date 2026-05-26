import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Delete, Lock } from 'lucide-react'
import { toast } from 'sonner'
import type { Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useCart } from '@/stores/cart'
import { initials } from '@/lib/format'
import { cn } from '@/lib/cn'

const PIN_LENGTH = 4

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

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  const lockSecondsLeft = useMemo(() => {
    if (!lockedUntil) return 0
    return Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  }, [lockedUntil, now])

  const submit = async (raw: string): Promise<void> => {
    if (!waiter || busy || lockedUntil) return
    setBusy(true)
    try {
      const res = await window.afisant.auth.verifyPin(waiter.id, raw)
      if (res.ok && res.waiter) {
        login(res.waiter)
        useCart.setState({ orderId: null, tableId: null, lines: [] })
        toast.success(`Xush kelibsiz, ${res.waiter.firstName}`)
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

  const press = (d: string): void => {
    if (lockedUntil || busy) return
    if (pin.length >= PIN_LENGTH) return
    const next = pin + d
    setPin(next)
    if (next.length === PIN_LENGTH) void submit(next)
  }

  const backspace = (): void => {
    if (lockedUntil || busy) return
    setPin((p) => p.slice(0, -1))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lockedUntil || busy) return
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') backspace()
      else if (e.key === 'Escape') navigate('/login')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, lockedUntil, busy])

  if (!waiter) {
    return (
      <div className="grid h-full place-items-center">
        <div className="card h-24 w-72 animate-pulse" />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="flex h-full flex-col items-center justify-center px-6 outline-none"
    >
      <button
        onClick={() => navigate('/login')}
        className="btn-ghost absolute left-6 top-6"
      >
        <ArrowLeft size={16} /> Orqaga
      </button>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex w-full max-w-sm flex-col items-center"
      >
        <div className="mb-4 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-brand-info/30 to-brand-purple/30 text-2xl font-semibold">
          {initials(waiter.firstName, waiter.lastName)}
        </div>
        <h2 className="text-xl font-semibold">
          {waiter.firstName} {waiter.lastName}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {lockedUntil ? (
            <span className="inline-flex items-center gap-1.5 text-brand-warn">
              <Lock size={12} /> Bloklangan · {lockSecondsLeft}s
            </span>
          ) : (
            'PIN-kodni kiriting'
          )}
        </p>

        <motion.div
          animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
          transition={{ duration: 0.36 }}
          className="mt-7 flex gap-3"
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => {
            const filled = i < pin.length
            return (
              <span
                key={i}
                className={cn(
                  'h-3.5 w-3.5 rounded-full border transition-all',
                  filled
                    ? 'border-brand-success bg-brand-success shadow-glow'
                    : 'border-line bg-bg-card'
                )}
              />
            )
          })}
        </motion.div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <Key key={n} disabled={!!lockedUntil || busy} onClick={() => press(String(n))}>
              {n}
            </Key>
          ))}
          <span />
          <Key disabled={!!lockedUntil || busy} onClick={() => press('0')}>
            0
          </Key>
          <Key
            disabled={!!lockedUntil || busy || pin.length === 0}
            onClick={backspace}
            variant="ghost"
            aria-label="O'chirish"
          >
            <Delete size={18} />
          </Key>
        </div>
      </motion.div>
    </div>
  )
}

interface KeyProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost'
}
function Key({ children, variant = 'default', className, ...rest }: KeyProps): JSX.Element {
  return (
    <button
      {...rest}
      className={cn(
        'grid h-16 w-16 place-items-center rounded-2xl text-xl font-semibold transition-all',
        variant === 'default'
          ? 'border border-line bg-bg-card text-ink hover:bg-bg-elevated hover:border-line-strong active:scale-95'
          : 'text-ink-soft hover:bg-bg-card hover:text-ink',
        className
      )}
    >
      {children}
    </button>
  )
}
