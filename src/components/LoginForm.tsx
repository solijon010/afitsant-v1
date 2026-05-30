import { useState, useRef } from 'react'
import { Phone, Lock, XCircle, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

interface LoginFormProps {
  onSuccess?: () => void
  onSubmit?: (phone: string, password: string) => Promise<boolean>
}

export default function LoginForm({ onSuccess, onSubmit }: LoginFormProps): JSX.Element {
  const [phone, setPhone]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading]       = useState(false)
  const [focused, setFocused]           = useState<'phone' | 'password' | null>(null)
  const [errorFields, setErrorFields]   = useState<Set<'phone' | 'password'>>(new Set())
  const [shakingFields, setShakingFields] = useState<Set<'phone' | 'password'>>(new Set())
  const passRef = useRef<HTMLInputElement>(null)

  const triggerShake = (fields: ('phone' | 'password')[]): void => {
    const s = new Set(fields) as Set<'phone' | 'password'>
    setErrorFields(s); setShakingFields(s)
    setTimeout(() => { setShakingFields(new Set()); setErrorFields(new Set()) }, 380)
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const invalid: ('phone' | 'password')[] = []
    if (!phone.trim()) invalid.push('phone')
    if (!password.trim()) invalid.push('password')
    if (invalid.length > 0) { triggerShake(invalid); return }
    setIsLoading(true)
    try {
      const ok = onSubmit ? await onSubmit(phone, password) : true
      if (ok) onSuccess?.()
    } finally { setIsLoading(false) }
  }

  /* Input border rangi */
  const inputBorder = (f: 'phone' | 'password'): string => {
    if (errorFields.has(f)) return '1.5px solid #EF4444'
    if (focused === f)      return '1.5px solid rgba(245,200,66,0.9)'
    return '1.5px solid rgba(255,255,255,0.13)'
  }
  const inputBg = (f: 'phone' | 'password'): string =>
    focused === f ? 'rgba(245,200,66,0.07)' : 'rgba(255,255,255,0.06)'

  return (
    /* Glass karta */
    <div style={{
      width: '100%',
      background: 'rgba(8,6,2,0.58)',
      backdropFilter: 'blur(22px)',
      WebkitBackdropFilter: 'blur(22px)',
      border: '1px solid rgba(245,200,66,0.22)',
      borderRadius: 22,
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
    }}>

      {/* Oltin chiziq — tepa */}
      <div style={{ height: 3, background: 'linear-gradient(90deg,transparent,#f5c842 40%,#ffe680 50%,#f5c842 60%,transparent)' }} />

      <div style={{ padding: '28px 28px 30px' }}>

        {/* Title */}
        <p style={{ margin: '0 0 22px', fontSize: 13, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,200,66,0.75)' }}>
          Tizimga kirish
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>

          {/* ── Telefon ── */}
          <div className={cn(shakingFields.has('phone') && 'animate-shake')} style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 7, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(245,200,66,0.7)' }}>
              Telefon raqam
            </label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: inputBg('phone'),
              border: inputBorder('phone'),
              borderRadius: 12, padding: '0 14px', height: 50,
              transition: 'border-color .15s, background .15s',
            }}>
              <Phone size={16} color="rgba(245,200,66,0.55)" strokeWidth={2} style={{ flexShrink: 0 }} />
              <input
                type="tel"
                inputMode="numeric"
                placeholder="+998 90 123 45 67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onFocus={() => setFocused('phone')}
                onBlur={() => setFocused(null)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); passRef.current?.focus() } }}
                disabled={isLoading}
                autoComplete="username"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 14, color: 'white', caretColor: '#f5c842',
                }}
              />
              {phone && (
                <button type="button" tabIndex={-1} onClick={() => setPhone('')}
                  style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <XCircle size={15} color="rgba(255,255,255,0.3)" />
                </button>
              )}
            </div>
          </div>

          {/* ── Parol ── */}
          <div className={cn(shakingFields.has('password') && 'animate-shake')} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(245,200,66,0.7)' }}>
                Parol
              </label>
              <button type="button"
                style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color .15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(245,200,66,0.75)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
              >
                Unutdingizmi?
              </button>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: inputBg('password'),
              border: inputBorder('password'),
              borderRadius: 12, padding: '0 14px', height: 50,
              transition: 'border-color .15s, background .15s',
            }}>
              <Lock size={16} color="rgba(245,200,66,0.55)" strokeWidth={2} style={{ flexShrink: 0 }} />
              <input
                ref={passRef}
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                disabled={isLoading}
                autoComplete="current-password"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 14, color: 'white', caretColor: '#f5c842',
                }}
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {showPassword
                  ? <EyeOff size={15} color="rgba(255,255,255,0.35)" />
                  : <Eye size={15} color="rgba(255,255,255,0.35)" />}
              </button>
            </div>
          </div>

          {/* ── Kirish tugmasi ── */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%', height: 52, borderRadius: 13, border: 'none',
              background: isLoading
                ? '#b8960e'
                : 'linear-gradient(180deg,#ffe04d 0%,#f5c000 55%,#d4a200 100%)',
              color: '#0f0900', fontSize: 15, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.75 : 1,
              transition: 'opacity .15s',
              boxShadow: isLoading ? 'none' : '0 4px 18px rgba(245,192,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
            onMouseEnter={e => { if (!isLoading) e.currentTarget.style.boxShadow = '0 6px 24px rgba(245,192,0,0.55), inset 0 1px 0 rgba(255,255,255,0.25)' }}
            onMouseLeave={e => { if (!isLoading) e.currentTarget.style.boxShadow = '0 4px 18px rgba(245,192,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)' }}
          >
            {isLoading ? (
              <><Loader2 size={16} className="animate-spin" /> Kirilmoqda…</>
            ) : (
              <>Kirish <ArrowRight size={16} strokeWidth={2.5} /></>
            )}
          </button>
        </form>

        {/* Footer */}
        <p style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
          Muammo bo'lsa{' '}
          <span style={{ color: 'rgba(245,200,66,0.5)', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}>
            administratorga
          </span>
          {' '}murojaat qiling
        </p>

      </div>

      {/* Oltin chiziq — pastda */}
      <div style={{ height: 2, background: 'linear-gradient(90deg,transparent,#f5c842 40%,#ffe680 50%,#f5c842 60%,transparent)' }} />
    </div>
  )
}
