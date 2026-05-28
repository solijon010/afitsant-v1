/**
 * VirtualKeyboard — POS uchun ekranda klaviatura
 *
 * Foydalanish:
 *   1. main.tsx da <KeyboardProvider> bilan o'rashiz
 *   2. Input component ichida useVirtualInput() hook ishlatiladi
 *
 * Xususiyatlar:
 *   - Numeric layout: telefon raqam uchun (0-9, +, ⌫)
 *   - Alpha layout: parol/matn uchun (QWERTY, shift, ⌫)
 *   - onMouseDown preventDefault → input focus yo'qolmaydi
 *   - Fizik klaviatura bilan ham ishlaydi (readOnly emas)
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

// ─── Types ────────────────────────────────────────────────────────────────────

export type KbLayout = 'numeric' | 'alpha'

interface KbEntry {
  /** Har doim eng yangi qiymatni qaytaradi (ref orqali) */
  getValue: () => string
  onChange: (v: string) => void
  layout: KbLayout
}

interface KbCtxValue {
  openKb: (entry: KbEntry) => void
  closeKb: () => void
  current: KbEntry | null
}

// ─── Context ──────────────────────────────────────────────────────────────────

const KbCtx = createContext<KbCtxValue>({
  openKb: () => {},
  closeKb: () => {},
  current: null,
})

// ─── Provider ─────────────────────────────────────────────────────────────────

export function KeyboardProvider({ children }: { children: ReactNode }): JSX.Element {
  const [current, setCurrent] = useState<KbEntry | null>(null)

  const openKb = useCallback((entry: KbEntry) => setCurrent(entry), [])
  const closeKb = useCallback(() => setCurrent(null), [])

  return (
    <KbCtx.Provider value={{ openKb, closeKb, current }}>
      {children}
      <AnimatePresence>
        {current && <VirtualKeyboard key="vkb" />}
      </AnimatePresence>
    </KbCtx.Provider>
  )
}

// ─── Hook: context ga kirish ──────────────────────────────────────────────────

export function useKeyboard(): KbCtxValue {
  return useContext(KbCtx)
}

// ─── Hook: input uchun props qaytaradi ────────────────────────────────────────

export function useVirtualInput(
  value: string,
  onChange: (v: string) => void,
  layout: KbLayout = 'alpha',
): Pick<React.InputHTMLAttributes<HTMLInputElement>, 'onFocus'> {
  const { openKb } = useKeyboard()

  // valueRef har render da yangilanadi — DEL uchun to'g'ri qiymat olish uchun
  const valueRef = useRef(value)
  valueRef.current = value

  const onFocus = useCallback(() => {
    openKb({
      getValue: () => valueRef.current,
      onChange,
      layout,
    })
  }, [openKb, onChange, layout])

  return { onFocus }
}

// ─── KbInput: className bilan ishlaydigan universal input ────────────────────

export function KbInput({
  value,
  onChange,
  layout = 'alpha',
  className,
  placeholder,
  type = 'text',
  disabled,
  min,
  max,
  step,
}: {
  value: string | number
  onChange: (v: string) => void
  layout?: KbLayout
  className?: string
  placeholder?: string
  type?: string
  disabled?: boolean
  min?: number
  max?: number
  step?: number
}): JSX.Element {
  const strVal = String(value ?? '')
  const vkb = useVirtualInput(strVal, onChange, layout)
  return (
    <input
      type={type}
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      onFocus={vkb.onFocus}
    />
  )
}

// ─── Klaviatura Layouts ───────────────────────────────────────────────────────

const NUM_ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['+', '0', '⌫'],
]

const ALPHA_LOWER: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫'],
  ['.', '@', '-', '_', 'SPACE', '✓'],
]

const ALPHA_UPPER: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['⇧', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
  ['.', '@', '-', '_', 'SPACE', '✓'],
]

// ─── VirtualKeyboard UI ───────────────────────────────────────────────────────

function VirtualKeyboard(): JSX.Element {
  const { current, closeKb } = useKeyboard()
  const [shifted, setShifted] = useState(false)

  if (!current) return <></>

  const handleKey = (key: string) => {
    const val = current.getValue()

    if (key === '⌫') {
      current.onChange(val.slice(0, -1))
    } else if (key === '✓') {
      closeKb()
    } else if (key === 'SPACE') {
      current.onChange(val + ' ')
    } else if (key === '⇧') {
      setShifted((s) => !s)
    } else {
      current.onChange(val + key)
      if (shifted) setShifted(false) // bitta harf yozilganda kichikka qaytadi
    }
  }

  const rows =
    current.layout === 'numeric'
      ? NUM_ROWS
      : shifted
        ? ALPHA_UPPER
        : ALPHA_LOWER

  return createPortal(
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      onMouseDown={(e) => e.preventDefault()} // input focus ni saqlab qoladi
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'linear-gradient(180deg, #0d1f0e 0%, #071007 100%)',
        borderTop: '1px solid rgba(212,160,20,0.3)',
        padding: '10px 8px 20px',
        boxShadow: '0 -16px 48px rgba(0,0,0,0.65)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Yopish chizig'i */}
      <div
        style={{
          width: 36,
          height: 3,
          borderRadius: 2,
          background: 'rgba(212,160,20,0.35)',
          margin: '0 auto 10px',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
            {row.map((key, ki) => (
              <KeyBtn key={`${ri}-${ki}`} label={key} onPress={() => handleKey(key)} shifted={shifted} />
            ))}
          </div>
        ))}
      </div>
    </motion.div>,
    document.body,
  )
}

// ─── Tugma ───────────────────────────────────────────────────────────────────

function KeyBtn({
  label,
  onPress,
  shifted,
}: {
  label: string
  onPress: () => void
  shifted: boolean
}): JSX.Element {
  const isOk = label === '✓'
  const isDel = label === '⌫'
  const isShift = label === '⇧'
  const isSpace = label === 'SPACE'
  const isSpecial = isOk || isDel || isShift || isSpace

  const width = isSpace ? 170 : isDel || isOk ? 72 : isShift ? 60 : 50

  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault() // focus yo'qolmasin
        onPress()
      }}
      style={{
        height: 50,
        minWidth: width,
        borderRadius: 10,
        border: 'none',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: isSpace ? 13 : 19,
        fontWeight: isSpecial ? 700 : 500,
        fontFamily: isSpace || isSpecial ? 'inherit' : 'monospace',
        cursor: 'pointer',
        transition: 'background 0.08s, transform 0.06s',
        WebkitTapHighlightColor: 'transparent',
        color: isOk ? '#fff' : '#e8f5e9',
        background: isOk
          ? 'linear-gradient(135deg, #1e6b20, #2d8c30)'
          : isDel || isShift
            ? 'rgba(255,255,255,0.07)'
            : isSpace
              ? 'rgba(255,255,255,0.06)'
              : isShift && shifted
                ? 'rgba(212,160,20,0.25)'
                : 'rgba(255,255,255,0.11)',
        boxShadow: isOk
          ? '0 2px 14px rgba(45,140,48,0.4)'
          : '0 1px 3px rgba(0,0,0,0.35)',
        letterSpacing: isSpace ? 1 : 0,
      }}
    >
      {isSpace ? "Bo'sh joy" : label}
    </button>
  )
}
