import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Delete } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import type { Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useCart } from '@/stores/cart'
import { initials } from '@/lib/format'
import { PIN_LENGTH } from '@/components/PinPad'
import { cn } from '@/lib/cn'

/* ─── Raqam tugmalari ─── */
const DIGITS = ['1','2','3','4','5','6','7','8','9']

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

  /* Waiter yukla */
  useEffect(() => {
    const id = Number(waiterId)
    void window.afisant.auth.listWaiters().then((list) => {
      const found = list.find((w) => w.id === id) ?? null
      setWaiter(found)
      if (found?.lockedUntil && found.lockedUntil > Date.now()) setLockedUntil(found.lockedUntil)
    })
  }, [waiterId])

  /* Blok sanash */
  useEffect(() => {
    if (!lockedUntil) return
    const t = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= lockedUntil) setLockedUntil(null)
    }, 250)
    return () => clearInterval(t)
  }, [lockedUntil])

  /* Focus */
  useEffect(() => { containerRef.current?.focus() }, [])

  /* Klaviatura */
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
      setTimeout(() => setShake(false), 420)
      setPin('')
      if (res.lockedUntil) {
        setLockedUntil(res.lockedUntil)
        toast.error('5 ta xato — 1 daqiqaga bloklandi')
      } else {
        toast.error(res.message ?? "Noto'g'ri PIN", {
          description: res.attemptsLeft ? `${res.attemptsLeft} urinish qoldi` : undefined,
        })
      }
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

  const isSpecial = waiter?.role === 'manager' || waiter?.role === 'super_waiter'

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 flex flex-col bg-[#F5F5F4] outline-none"
    >
      {/* ── Yuqori panel ── */}
      <div className="flex h-14 shrink-0 items-center px-5">
        <button
          onClick={() => navigate('/select-waiter')}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-stone-500 transition-colors hover:bg-white hover:text-stone-900"
        >
          <ArrowLeft size={16} strokeWidth={2} />
          Orqaga
        </button>
      </div>

      {/* ── Asosiy kontent ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10">

        {/* Avatar */}
        <motion.div
          animate={shake ? { x: [-10, 10, -7, 7, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
          className="mb-5"
        >
          <div className={cn(
            'flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold tracking-wide shadow-sm',
            isSpecial
              ? 'bg-amber-50 text-amber-700 ring-2 ring-amber-300'
              : 'bg-white text-stone-700 ring-1 ring-stone-200',
          )}>
            {waiter ? initials(waiter.firstName, waiter.lastName) : '…'}
          </div>
        </motion.div>

        {/* Ism */}
        <h1 className="mb-1 text-lg font-bold text-stone-900 tracking-wide">
          {waiter ? `${waiter.lastName} ${waiter.firstName}`.trim() : ''}
        </h1>

        {/* Holat matni */}
        <AnimatePresence mode="wait">
          {lockedUntil ? (
            <motion.p
              key="locked"
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-6 text-xs font-semibold text-red-500 tracking-wider uppercase"
            >
              Bloklangan · {lockSecondsLeft}s
            </motion.p>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-6 text-[11px] font-medium uppercase tracking-[0.22em] text-stone-400"
            >
              PIN-kodni kiriting
            </motion.p>
          )}
        </AnimatePresence>

        {/* PIN nuqtalar */}
        <div className="mb-8 flex items-center gap-4">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => {
            const filled = i < pin.length
            return (
              <motion.div
                key={i}
                animate={{ scale: filled ? [1, 1.25, 1] : 1 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'h-3 w-3 rounded-full transition-colors duration-150',
                  filled
                    ? isSpecial ? 'bg-amber-400' : 'bg-[#C2410C]'
                    : 'bg-stone-200',
                )}
              />
            )
          })}
        </div>

        {/* NumPad */}
        <div className="grid w-full max-w-[280px] grid-cols-3 gap-2.5">
          {DIGITS.map(n => (
            <NumKey key={n} label={n} disabled={disabled} onClick={() => press(n)} />
          ))}

          {/* Bo'sh joy */}
          <div />

          {/* 0 */}
          <NumKey label="0" disabled={disabled} onClick={() => press('0')} />

          {/* O'chirish */}
          <button
            type="button"
            disabled={busy || pin.length === 0}
            onClick={del}
            className={cn(
              'flex h-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-stone-100',
              'transition-all duration-100 active:scale-95',
              busy || pin.length === 0
                ? 'cursor-default opacity-30'
                : 'cursor-pointer text-red-400 hover:bg-red-50 hover:ring-red-100',
            )}
          >
            <Delete size={20} strokeWidth={2} />
          </button>
        </div>

        {/* PIN unutilsa */}
        {!lockedUntil && (
          <p className="mt-7 text-[10px] text-stone-300">
            PIN unutilsa — Sozlamalar → Afitsantlar
          </p>
        )}
      </div>
    </div>
  )
}

/* ─── Raqam tugma ─── */
function NumKey({ label, disabled, onClick }: {
  label: string
  disabled: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-16 items-center justify-center rounded-2xl bg-white text-xl font-semibold text-stone-800',
        'shadow-sm ring-1 ring-stone-100 transition-all duration-100',
        disabled
          ? 'cursor-default opacity-30'
          : 'cursor-pointer hover:bg-stone-50 hover:ring-stone-200 active:scale-95',
      )}
    >
      {label}
    </button>
  )
}
