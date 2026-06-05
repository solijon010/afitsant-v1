import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Lock, Eye, EyeOff } from 'lucide-react'

/* ─── Yordamchi inputlar ──────────────────────────────────────── */

function TextInput({
  value,
  onChange,
  disabled,
  placeholder,
  type = 'text',
  autoComplete,
  right,
}: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  placeholder: string
  type?: string
  autoComplete?: string
  right?: React.ReactNode
}): JSX.Element {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          height: 44,
          background: 'rgba(0,0,0,0.30)',
          border: `1px solid ${focused ? 'rgba(212,160,20,0.6)' : 'rgba(74,140,63,0.35)'}`,
          borderRadius: 12,
          padding: right ? '0 42px 0 14px' : '0 14px',
          color: '#e8f5e9',
          fontFamily: 'monospace',
          fontSize: 14,
          outline: 'none',
          transition: 'border-color 0.2s',
          boxSizing: 'border-box' as const,
        }}
      />
      {right && (
        <div style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
        }}>
          {right}
        </div>
      )}
    </div>
  )
}

/* ─── Asosiy komponent ────────────────────────────────────────── */

export default function WaiterLogin(): JSX.Element {
  const [phone, setPhone]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!phone.trim() || !password.trim()) {
      setError('Telefon raqam va parol kiriting')
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await window.afisant.auth.loginServer(phone.trim(), password)
      if (!result.ok) {
        setError(result.message ?? 'Login xatosi')
        return
      }

      const user = result.user
      if (user?.role !== 'AFITSANT' && user?.role !== 'SUPER_AFITSANT') {
        setError('Siz afitsant emassiz')
        return
      }

      if (user.branchId) {
        await window.afisant.auth.selectBranch(user.branchId, '')
      } else if (result.branches?.length === 1) {
        await window.afisant.auth.selectBranch(result.branches[0].id, result.branches[0].name)
      }

      navigate('/select-waiter', { replace: true })
    } catch {
      setError('Ulanishda xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* ── CSS animatsiyalar ─────────────────────────────────── */}
      <style>{`
        @keyframes kenBurns {
          0%   { transform: scale(1)    translate(0,    0);    }
          50%  { transform: scale(1.08) translate(-1%, -0.5%); }
          100% { transform: scale(1)    translate(0,    0);    }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes floatLeaf {
          0%   { transform: translateY(0)     rotate(0deg);  }
          50%  { transform: translateY(-12px) rotate(5deg);  }
          100% { transform: translateY(0)     rotate(-5deg); }
        }
        @keyframes glow {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1;   }
        }
        @keyframes shimmer {
          0%   { background-position: 200% center; }
          100% { background-position:   0% center; }
        }
        .waiter-btn:hover:not(:disabled) {
          background-position: right center !important;
          transform: translateY(-1px) !important;
        }
        .waiter-btn:disabled { opacity: 0.65; cursor: not-allowed; }
      `}</style>

      {/* ── Sahifa ──────────────────────────────────────────────── */}
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#030f06',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Fon rasmi + Ken Burns */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute',
            inset: '-5%',
            backgroundImage: "url('/manzara foto.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'brightness(0.6) saturate(1.3)',
            animation: 'kenBurns 20s ease-in-out infinite',
          }} />
        </div>

        {/* Qora overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.38)',
        }} />

        {/* Oltin glow — yuqori markazda, puls */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 640,
          height: 320,
          background:
            'radial-gradient(ellipse at center top, rgba(212,160,20,0.18) 0%, transparent 70%)',
          animation: 'glow 2.5s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* ── Kontent ─────────────────────────────────────────── */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 420,
          padding: '0 20px 32px',
          animation: 'fadeUp 0.8s cubic-bezier(0.22,1,0.36,1) both',
        }}>

          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <img
              src="/LOGO.PNJ.png"
              alt="Logo"
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                objectFit: 'cover',
                filter: 'drop-shadow(0 0 16px rgba(212,160,20,0.5))',
                animation: 'floatLeaf 4s ease-in-out infinite',
              }}
            />
          </div>

          {/* Sarlavha */}
          <div style={{ textAlign: 'center', fontFamily: 'Georgia, serif', marginBottom: 14 }}>
            <div style={{
              fontSize: 38,
              fontWeight: 800,
              color: '#d4a020',
              letterSpacing: 6,
              lineHeight: 1.15,
              textShadow:
                '0 0 30px rgba(212,160,20,0.5), 2px 3px 0 rgba(0,0,0,0.5)',
            }}>
              SOHIL
            </div>
            <div style={{
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: 6,
              lineHeight: 1.15,
              background:
                'linear-gradient(180deg, #f0d060 0%, #d4a020 50%, #b8860b 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              CHOYXONASI
            </div>
          </div>

          {/* Oltin bezak chizig'i — 3 ta olmoscha */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 22,
          }}>
            <div style={{
              flex: 1,
              height: 1,
              background:
                'linear-gradient(to right, transparent, rgba(212,160,20,0.6))',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {[6, 10, 6].map((size, i) => (
                <div key={i} style={{
                  width: size,
                  height: size,
                  background: '#d4a020',
                  transform: 'rotate(45deg)',
                  boxShadow: `0 0 ${size + 2}px rgba(212,160,20,${size > 6 ? 0.9 : 0.6})`,
                }} />
              ))}
            </div>
            <div style={{
              flex: 1,
              height: 1,
              background:
                'linear-gradient(to left, transparent, rgba(212,160,20,0.6))',
            }} />
          </div>

          {/* ── Forma karta ─────────────────────────────────── */}
          <div style={{
            background: 'rgba(4,18,7,0.75)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(212,160,20,0.2)',
            borderRadius: 24,
            padding: 28,
            boxShadow:
              '0 0 0 1px rgba(0,80,20,0.3), 0 24px 60px rgba(0,0,0,0.7)',
          }}>
            <form onSubmit={(e) => void handleSubmit(e)}>

              {/* Telefon */}
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block',
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: 2,
                  color: '#7dc87f',
                }}>
                  Telefon raqam
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <IconBox><Phone size={16} color="white" /></IconBox>
                  <TextInput
                    value={phone}
                    onChange={setPhone}
                    disabled={loading}
                    placeholder="+998901234567"
                    type="tel"
                    autoComplete="tel"
                  />
                </div>
              </div>

              {/* Parol */}
              <div style={{ marginBottom: error ? 14 : 22 }}>
                <label style={{
                  display: 'block',
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: 2,
                  color: '#7dc87f',
                }}>
                  Parol
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <IconBox><Lock size={16} color="white" /></IconBox>
                  <TextInput
                    value={password}
                    onChange={setPassword}
                    disabled={loading}
                    placeholder="••••••••"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    right={
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'rgba(125,200,127,0.65)',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    }
                  />
                </div>
              </div>

              {/* Xato xabari */}
              {error && (
                <div style={{
                  marginBottom: 16,
                  padding: '8px 12px',
                  fontSize: 12,
                  color: '#f87171',
                  background: 'rgba(248,113,113,0.10)',
                  border: '1px solid rgba(248,113,113,0.20)',
                  borderRadius: 8,
                }}>
                  {error}
                </div>
              )}

              {/* Kirish tugmasi */}
              <button
                type="submit"
                disabled={loading}
                className="waiter-btn"
                style={{
                  width: '100%',
                  height: 46,
                  border: 'none',
                  borderRadius: 12,
                  background:
                    'linear-gradient(90deg,#9a7009,#d4a020,#f0c030,#d4a020,#9a7009)',
                  backgroundSize: '200% auto',
                  animation: 'shimmer 3s linear infinite',
                  color: '#1a0f00',
                  fontSize: 14,
                  fontWeight: 800,
                  fontFamily: 'Georgia, serif',
                  textTransform: 'uppercase' as const,
                  letterSpacing: 4,
                  boxShadow: '0 4px 20px rgba(212,160,20,0.4)',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, background-position 0.4s',
                }}
              >
                {loading ? '⟳  Kirish...' : '→  Kirish'}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p style={{
            marginTop: 20,
            textAlign: 'center',
            fontSize: 10,
            letterSpacing: 3,
            color: 'rgba(212,160,20,0.30)',
            textTransform: 'uppercase' as const,
          }}>
            ✦ Sohil Choyxonasi ✦
          </p>
        </div>
      </div>
    </>
  )
}

/* ─── Kichik yordamchi: yashil ikonka qutisi ─────────────────── */
function IconBox({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div style={{
      width: 44,
      height: 44,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 10,
      background: 'linear-gradient(135deg, #1e6b20, #2d8c30)',
      boxShadow: '0 2px 8px rgba(45,140,48,0.4)',
    }}>
      {children}
    </div>
  )
}
