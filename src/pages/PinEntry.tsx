import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import type { Waiter } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useCart } from '@/stores/cart'
import { PIN_LENGTH } from '@/components/PinPad'
import hisobchimLogo from '@/assets/logo.png'
import manzaraFoto from '@/assets/rasmim.png'

const DIGITS = ['1','2','3','4','5','6','7','8','9']
const UZ_DAYS = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba']
const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentyabr','Oktyabr','Noyabr','Dekabr']

function useTick() {
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setTick(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return tick
}

function AnalogClock({ size = 180 }: { size?: number }): JSX.Element {
  const tick = useTick()
  const h = tick.getHours() % 12
  const m = tick.getMinutes()
  const s = tick.getSeconds()

  const hourDeg   = (h + m / 60) * 30
  const minuteDeg = (m + s / 60) * 6
  const secondDeg = s * 6

  const cx = size / 2
  const r  = size / 2

  const hand = (deg: number, len: number, width: number, color: string) => {
    const rad = (deg - 90) * (Math.PI / 180)
    const x2 = cx + len * Math.cos(rad)
    const y2 = cx + len * Math.sin(rad)
    return <line x1={cx} y1={cx} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" />
  }

  const numbers = [1,2,3,4,5,6,7,8,9,10,11,12]

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Soya */}
      <defs>
        <filter id="clock-shadow">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.12" />
        </filter>
      </defs>

      {/* Yuz */}
      <circle cx={cx} cy={cx} r={r - 2} fill="#ffffff" filter="url(#clock-shadow)" />
      <circle cx={cx} cy={cx} r={r - 2} fill="none" stroke="#e5e7eb" strokeWidth={1} />

      {/* Daqiqa belgilari */}
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i * 6 - 90) * (Math.PI / 180)
        const isHour = i % 5 === 0
        const inner = isHour ? r - 14 : r - 10
        return (
          <line
            key={i}
            x1={cx + inner * Math.cos(a)} y1={cx + inner * Math.sin(a)}
            x2={cx + (r - 4) * Math.cos(a)} y2={cx + (r - 4) * Math.sin(a)}
            stroke={isHour ? '#9ca3af' : '#d1d5db'}
            strokeWidth={isHour ? 2 : 1}
          />
        )
      })}

      {/* Raqamlar */}
      {numbers.map(n => {
        const a = (n * 30 - 90) * (Math.PI / 180)
        const nr = r - 26
        return (
          <text
            key={n}
            x={cx + nr * Math.cos(a)}
            y={cx + nr * Math.sin(a)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * 0.085}
            fontWeight="500"
            fill="#374151"
            fontFamily="system-ui"
          >
            {n}
          </text>
        )
      })}

      {/* Soat mili */}
      {hand(hourDeg,   r * 0.48, size * 0.038, '#1e293b')}
      {/* Daqiqa mili */}
      {hand(minuteDeg, r * 0.65, size * 0.028, '#1e293b')}
      {/* Soniya mili (qizil) */}
      {hand(secondDeg, r * 0.70, size * 0.016, '#ef4444')}

      {/* Markaz doira */}
      <circle cx={cx} cy={cx} r={size * 0.035} fill="#1e293b" />
      <circle cx={cx} cy={cx} r={size * 0.015} fill="#ef4444" />
    </svg>
  )
}

function useClock() {
  const tick = useTick()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    time: `${pad(tick.getHours())}:${pad(tick.getMinutes())}`,
    secs: pad(tick.getSeconds()),
    date: `${UZ_DAYS[tick.getDay()]}, ${tick.getDate()} ${UZ_MONTHS[tick.getMonth()]}`,
  }
}

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
  const clock = useClock()

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

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 outline-none"
      style={{ display: 'flex', background: '#D2D0D1' }}
    >
      {/* ── CHAP: PIN FORM ── */}
      <div style={{
        width: 'clamp(380px, 52%, 620px)', height: '100%',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        background: '#D2D0D1',
      }}>

        {/* TOP BAR */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 28px', flexShrink: 0,
        }}>
          {/* Orqaga */}
          <button
            onClick={() => navigate('/select-waiter')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#D2D0D1', border: 'none', borderRadius: 12,
              padding: '9px 16px', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, color: '#374151',
              boxShadow: '4px 4px 10px #aaa8a9, -3px -3px 8px #e8e6e7',
            }}
          >
            <ArrowLeft size={15} strokeWidth={2.5} />
            Orqaga
          </button>

          <div />
        </div>

      {/* ── MARKAZ ── */}
      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
        paddingTop: '1vh',
      }}>

        {/* Logo */}
        <div style={{
          width: 130, height: 130, borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '6px 6px 14px #aaa8a9, -5px -5px 12px #e8e6e7',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 12,
        }}>
          <img src={hisobchimLogo} alt="Hisobchim"
            style={{ width: '92%', height: '92%', objectFit: 'contain' }}
            draggable={false} />
        </div>

        {/* Ism */}
        <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px' }}>
          {waiter ? `${waiter.lastName} ${waiter.firstName}`.trim() : ''}
        </h1>

        {/* Holat */}
        {lockedUntil ? (
          <p style={{ margin: '0 0 18px', fontSize: 12, fontWeight: 700, color: '#ef4444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Bloklangan · {lockSecondsLeft}s
          </p>
        ) : (
          <p style={{ margin: '0 0 18px', fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            PIN-kodni kiriting
          </p>
        )}

        {/* PIN nuqtalar */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 18 }} className={shake ? 'animate-shake' : ''}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => {
            const filled = i < pin.length
            return (
              <div key={i} style={{
                width: 14, height: 14, borderRadius: '50%',
                background: filled ? '#2563eb' : 'rgba(0,0,0,0.25)',
                boxShadow: filled ? '0 2px 8px rgba(37,99,235,0.5)' : 'inset 2px 2px 4px rgba(0,0,0,0.15)',
              }} />
            )
          })}
        </div>

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gap: 10, justifyContent: 'center' }}>
          {DIGITS.map(n => (
            <NumBtn key={n} disabled={disabled} onClick={() => press(n)}>
              {n}
            </NumBtn>
          ))}

          <div />

          <NumBtn disabled={disabled} onClick={() => press('0')}>0</NumBtn>

          {/* O'chirish */}
          <NumBtn disabled={busy || pin.length === 0} onClick={del} muted>
            ⌫
          </NumBtn>
        </div>

      </div>
      </div>{/* chap panel yopildi */}

      {/* ── O'NG: RASM PANEL ── */}
      <div style={{
        flex: 1, height: '100%', overflow: 'hidden',
        position: 'relative',
      }}>
        <img
          src={manzaraFoto}
          alt="POS"
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center',
            display: 'block',
          }}
        />


        {/* Chap tomondan yumshoq gradient */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to right, rgba(210,208,209,0.85) 0%, rgba(210,208,209,0.2) 25%, rgba(210,208,209,0) 45%)',
        }} />

        {/* Soat — pastki o'ng burchak, kichikroq va toza */}
        <div style={{
          position: 'absolute', top: 24, right: 24,
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(12px)',
          borderRadius: 16,
          padding: '14px 20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <AnalogClock size={140} />
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#1e293b', fontFamily: 'monospace', letterSpacing: '-1px' }}>
                {clock.time}
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8', fontFamily: 'monospace' }}>
                :{clock.secs}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', fontWeight: 500 }}>
              {clock.date}
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}

function NumBtn({ children, disabled, onClick, muted }: {
  children: React.ReactNode
  disabled: boolean
  onClick: () => void
  muted?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 64, height: 64, borderRadius: '50%',
        background: '#D2D0D1',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: muted ? 20 : 22,
        fontWeight: 600,
        color: muted ? '#ef4444' : '#1e293b',
        boxShadow: disabled
          ? '2px 2px 5px #b3b1b2, -2px -2px 5px #ebebea'
          : '6px 6px 12px #aaa8a9, -5px -5px 12px #e8e6e7',
        opacity: disabled && !muted ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}
