import { useEffect } from 'react'
import { Delete } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

export const PIN_LENGTH = 4

interface PinPadProps {
  pin: string
  onChange: (pin: string) => void
  disabled?: boolean
  shake?: boolean
  onSubmit?: (pin: string) => void
}

export default function PinPad({ pin, onChange, disabled = false, shake = false, onSubmit }: PinPadProps): JSX.Element {
  const press = (d: string): void => {
    if (disabled || pin.length >= PIN_LENGTH) return
    const next = pin + d
    onChange(next)
    if (next.length === PIN_LENGTH) onSubmit?.(next)
  }

  const backspace = (): void => {
    if (disabled) return
    onChange(pin.slice(0, -1))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (disabled) return
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') backspace()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, disabled])

  return (
    <div className="flex flex-col items-center">
      {/* Nuqta indikatorlar */}
      <motion.div
        animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.36 }}
        className="mb-7 mt-6 flex gap-3"
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

      {/* Klaviatura */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <PinKey key={n} disabled={disabled} onClick={() => press(String(n))}>
            {n}
          </PinKey>
        ))}
        <span />
        <PinKey disabled={disabled} onClick={() => press('0')}>
          0
        </PinKey>
        <PinKey
          disabled={disabled || pin.length === 0}
          onClick={backspace}
          variant="ghost"
          aria-label="O'chirish"
        >
          <Delete size={18} />
        </PinKey>
      </div>
    </div>
  )
}

interface PinKeyProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost'
}

export function PinKey({ children, variant = 'default', className, ...rest }: PinKeyProps): JSX.Element {
  return (
    <button
      {...rest}
      className={cn(
        'grid h-16 w-16 place-items-center rounded-2xl text-xl font-semibold transition-all',
        variant === 'default'
          ? 'border border-line bg-white text-ink shadow-sm hover:bg-bg-soft hover:border-line-strong active:scale-95'
          : 'text-ink-soft hover:bg-bg-soft hover:text-ink',
        rest.disabled && 'opacity-40 pointer-events-none',
        className
      )}
    >
      {children}
    </button>
  )
}
