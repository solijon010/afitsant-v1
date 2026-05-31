import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Delete } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import type { Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useCart } from '@/stores/cart'
import { PIN_LENGTH } from '@/components/PinPad'
import { cn } from '@/lib/cn'
import hisobchimLogo from '@/assets/logo.png'

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
      className="fixed inset-0 flex flex-col outline-none"
      style={{ background: '#151d64' }}
    >
      {/* ── TEPPA: Katta soat ── */}
      <TopPanel onBack={() => navigate('/select-waiter')} />

      {/* ── MARKAZ: PIN kontent ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10">

        {/* Avatar — Logo */}
        <motion.div
          animate={shake ? { x: [-10, 10, -7, 7, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
          className="mb-6 flex items-center justify-center"
        >
          <div style={{
            width: 140, height: 140,
            background: 'white', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
            padding: 20
          }}>
            <img
              src={hisobchimLogo}
              alt="Hisobchim"
              className="h-full w-full object-contain"
              draggable={false}
            />
          </div>
        </motion.div>

        {/* Ism */}
        <h1 className="mb-2 text-2xl font-bold text-white tracking-wide" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
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

/* ─── Tepa panel: soat va orqaga ─── */
function TopPanel({ onBack }: { onBack: () => void }): JSX.Element {
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setTick(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const pad = (n: number) => String(n).padStart(2, '0')
  const UZ_DAYS = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba']
  const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentyabr','Oktyabr','Noyabr','Dekabr']
  const timeStr = `${pad(tick.getHours())}:${pad(tick.getMinutes())}`
  const secStr = pad(tick.getSeconds())
  const dateStr = `${UZ_DAYS[tick.getDay()]}, ${tick.getDate()} ${UZ_MONTHS[tick.getMonth()]}`

  return (
    <div style={{
      width: '100%',
      padding: '24px 36px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'rgba(0,0,0,0.15)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.15)'
    }}>
      {/* Orqaga */}
      <button onClick={onBack} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, cursor: 'pointer',
        color: '#fff', fontSize: 14, fontWeight: 700,
        padding: '12px 18px', transition: 'all 0.1s',
        boxShadow: '0 4px 0 rgba(0,0,0,0.2)'
      }}
      onMouseDown={e => { e.currentTarget.style.transform = 'translateY(4px)'; e.currentTarget.style.boxShadow = '0 0px 0 rgba(0,0,0,0)' }}
      onMouseUp={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 0 rgba(0,0,0,0.2)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 0 rgba(0,0,0,0.2)' }}
      >
        <ArrowLeft size={18} /> Orqaga
      </button>

      {/* Soat */}
      <div style={{ textAlign: 'center', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
          <span style={{
            fontSize: 48, fontWeight: 900,
            color: '#ffffff', lineHeight: 0.9,
            fontFamily: 'monospace', letterSpacing: '-2px',
          }}>{timeStr}</span>
          <span style={{
            fontSize: 20, fontWeight: 700,
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'monospace', paddingBottom: 4,
          }}>:{secStr}</span>
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{dateStr}</p>
      </div>

      <div style={{ width: 110 }} /> {/* spacer */}
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
