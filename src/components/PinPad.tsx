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
  retro?: boolean
}

export default function PinPad({ pin, onChange, disabled = false, shake = false, onSubmit, retro = false }: PinPadProps): JSX.Element {
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
        className="mb-6 mt-4 flex gap-4"
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < pin.length
          return retro ? (
            <span
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: filled ? '2px solid #c9a96e' : '1px solid rgba(201,169,110,0.3)',
                background: filled ? 'linear-gradient(135deg, #c9a96e, #f0dc9a)' : 'rgba(201,169,110,0.05)',
                boxShadow: filled ? '0 0 10px rgba(201,169,110,0.5)' : 'none',
                transition: 'all 0.2s',
                display: 'inline-block',
              }}
            />
          ) : (
            <span
              key={i}
              className={cn(
                'h-3.5 w-3.5 rounded-full border transition-all',
                filled ? 'border-brand-success bg-brand-success shadow-glow' : 'border-line bg-bg-card'
              )}
            />
          )
        })}
      </motion.div>

      {/* Klaviatura */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <PinKey key={n} disabled={disabled} onClick={() => press(String(n))} retro={retro}>
            {n}
          </PinKey>
        ))}
        <span />
        <PinKey disabled={disabled} onClick={() => press('0')} retro={retro}>
          0
        </PinKey>
        <PinKey
          disabled={disabled || pin.length === 0}
          onClick={backspace}
          variant="ghost"
          retro={retro}
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
  retro?: boolean
}

export function PinKey({ children, variant = 'default', retro = false, className, ...rest }: PinKeyProps): JSX.Element {
  if (retro) {
    return (
      <button
        {...rest}
        className={cn('grid h-[62px] w-[62px] place-items-center rounded-2xl text-xl font-bold transition-all active:scale-95', rest.disabled && 'opacity-30 pointer-events-none', className)}
        style={{
          background: variant === 'default' ? 'linear-gradient(145deg, rgba(201,169,110,0.12), rgba(201,169,110,0.06))' : 'transparent',
          border: variant === 'default' ? '1px solid rgba(201,169,110,0.28)' : '1px solid transparent',
          color: '#e8d5a3',
          fontFamily: 'Georgia, serif',
          letterSpacing: '0.05em',
          boxShadow: variant === 'default' ? 'inset 0 1px 0 rgba(201,169,110,0.1)' : 'none',
        }}
        onMouseEnter={(e) => {
          if (variant === 'default') {
            (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(145deg, rgba(201,169,110,0.22), rgba(201,169,110,0.12))'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,169,110,0.5)'
            ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 12px rgba(201,169,110,0.15), inset 0 1px 0 rgba(201,169,110,0.15)'
          }
        }}
        onMouseLeave={(e) => {
          if (variant === 'default') {
            (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(145deg, rgba(201,169,110,0.12), rgba(201,169,110,0.06))'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,169,110,0.28)'
            ;(e.currentTarget as HTMLButtonElement).style.boxShadow = 'inset 0 1px 0 rgba(201,169,110,0.1)'
          }
        }}
      >
        {children}
      </button>
    )
  }

  return (
    <button
      {...rest}
      className={cn(
        'grid h-16 w-16 place-items-center rounded-2xl text-xl font-semibold transition-all',
        variant === 'default'
          ? 'border border-line bg-bg-card text-ink hover:bg-bg-elevated hover:border-line-strong active:scale-95'
          : 'text-ink-soft hover:bg-bg-card hover:text-ink',
        rest.disabled && 'opacity-40 pointer-events-none',
        className
      )}
    >
      {children}
    </button>
  )
}
