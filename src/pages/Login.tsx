import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Phone, Lock, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import loginBg from '@/assets/manzara-foto.png'
import logoImg from '@/assets/logo.png'

function ServerUrlDisplay(): JSX.Element {
  const { settings, load } = useSettings()
  useEffect(() => { if (!settings) void load() }, [settings, load])
  return (
    <p style={{ marginTop: 12, textAlign: 'center', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
      {settings?.serverUrl ?? '…'}
    </p>
  )
}

/* ——— Raqamli klaviatura ——— */
function NumPad({ onPress, onDelete, onOk, disabled }: {
  onPress: (d: string) => void
  onDelete: () => void
  onOk: () => void
  disabled?: boolean
}): JSX.Element {
  const btn = (label: React.ReactNode, onClick: () => void, accent = false): JSX.Element => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 48, borderRadius: 10, fontSize: 18, fontWeight: 700,
        background: accent ? 'linear-gradient(180deg,#ffe04d,#f5c000)' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${accent ? 'rgba(245,192,0,0.6)' : 'rgba(255,255,255,0.12)'}`,
        color: accent ? '#0a1200' : 'white',
        cursor: 'pointer', display: 'grid', placeItems: 'center',
        boxShadow: accent ? '0 4px 14px rgba(245,192,0,0.4)' : 'none',
        transition: 'opacity .15s',
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7' }}
      onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
    >
      {label}
    </button>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }}>
      {['1','2','3','4','5','6','7','8','9'].map(n => btn(n, () => onPress(n)))}
      {btn(<X size={16} />, onDelete)}
      {btn('0', () => onPress('0'))}
      {btn(<Check size={18} />, onOk, true)}
    </div>
  )
}

export default function LoginPage(): JSX.Element {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeField, setActiveField] = useState<'phone' | 'pass' | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const navigate = useNavigate()
  const setServerAuth = useAuth((s) => s.setServerAuth)
  const loadMenu = useMenu((s) => s.load)
  const loadTables = useTables((s) => s.load)

  const handleLogin = async (): Promise<void> => {
    if (!identifier.trim() || !password.trim()) { toast.error('Login va parol kiriting'); return }
    setLoading(true)
    try {
      const result = await window.afisant.auth.loginServer(identifier.trim(), password)
      if (!result.ok) { toast.error(result.message ?? 'Login xatosi'); return }
      setServerAuth(result.user!, result.token!, result.user?.branchId ?? null)
      const role = result.user?.role ?? ''
      const isSuperAdmin = role === 'SUPERADMIN'
      const hasBranch = !!result.user?.branchId
      const syncAll = async (): Promise<void> => {
        toast.loading("Ma'lumotlar yuklanmoqda…", { id: 'sync' })
        const res = await window.afisant.sync.fullPull()
        toast.dismiss('sync')
        if (!res.ok) toast.error("Serverdan ma'lumot yuklab bo'lmadi")
        else await Promise.all([loadMenu(), loadTables()])
      }
      if (isSuperAdmin && !hasBranch) {
        if (!result.branches || result.branches.length === 0) { toast.error('Filial topilmadi.'); return }
        if (result.branches.length === 1) {
          await window.afisant.auth.selectBranch(result.branches[0].id, result.branches[0].name)
          toast.success(`${result.branches[0].name} fililiga ulandi`)
          await syncAll(); navigate('/select-waiter', { replace: true })
        } else {
          navigate('/select-branch', { replace: true, state: { branches: result.branches } })
        }
        return
      }
      await syncAll()
      if (role === 'SUPER_AFITSANT' || role === 'MANAGER' || isSuperAdmin) navigate('/select-waiter', { replace: true })
      else navigate('/login', { replace: true })
    } catch { toast.error('Ulanishda xatolik yuz berdi') }
    finally { setLoading(false) }
  }

  /* NumPad tugmalari */
  const handleNumPress = (d: string): void => {
    if (activeField === 'phone') setIdentifier(v => v + d)
    else if (activeField === 'pass') setPassword(v => v + d)
  }
  const handleNumDelete = (): void => {
    if (activeField === 'phone') setIdentifier(v => v.slice(0, -1))
    else if (activeField === 'pass') setPassword(v => v.slice(0, -1))
  }
  const handleNumOk = (): void => {
    if (activeField === 'phone') setActiveField('pass')
    else if (activeField === 'pass') void handleLogin()
  }

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    flex: 1, height: 48, borderRadius: 12,
    padding: '0 40px 0 16px', fontSize: 14,
    background: focused ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
    border: `1px solid ${focused ? 'rgba(245,200,66,0.8)' : 'rgba(255,255,255,0.12)'}`,
    boxShadow: focused ? '0 0 0 3px rgba(245,200,66,0.12)' : 'none',
    color: 'white', outline: 'none',
    caretColor: '#f5c842', boxSizing: 'border-box' as const,
    transition: 'border-color .2s, box-shadow .2s',
  })

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      overflow: 'hidden', display: 'flex', background: '#050e05',
    }}>
      {/* Background */}
      <img
        src={loginBg} alt=""
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          filter: 'brightness(0.42) saturate(1.1)',
        }}
      />
      {/* Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, rgba(0,18,0,0.72) 0%, rgba(4,20,4,0.55) 100%)',
      }} />
      {/* Chet chiziqlari */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 2, height: '100%', background: 'linear-gradient(to bottom, transparent 10%, #f5c842 50%, transparent 90%)' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, width: 2, height: '100%', background: 'linear-gradient(to bottom, transparent 10%, #f5c842 50%, transparent 90%)' }} />

      {/* Konteyner */}
      <div style={{
        position: 'relative', zIndex: 10,
        width: '100%', display: 'flex',
        flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '0 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{
              width: 76, height: 76, borderRadius: '50%',
              border: '3px solid #f5c842',
              boxShadow: '0 0 0 5px rgba(245,200,66,0.14), 0 8px 28px rgba(0,0,0,0.7)',
              overflow: 'hidden', flexShrink: 0,
            }}>
              <img src={logoImg} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>

          {/* Sarlavha */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <h1 style={{
              fontSize: 32, fontWeight: 900, margin: 0, lineHeight: 1.2,
              color: '#f5c842', fontFamily: 'Georgia, serif',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              textShadow: '0 3px 12px rgba(0,0,0,0.9), 0 0 40px rgba(245,200,66,0.2)',
            }}>
              Sohil<br />Choyxonasi
            </h1>
            <div style={{ margin: '10px auto 0', width: 56, height: 2, background: 'linear-gradient(to right, transparent, #f5c842, transparent)' }} />
          </div>

          {/* Karta */}
          <div style={{
            background: '#060f06',
            border: '1px solid rgba(245,200,66,0.3)',
            borderRadius: 18,
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(245,200,66,0.07)',
          }}>
            <div style={{ height: 3, background: 'linear-gradient(90deg, transparent, #f5c842 40%, #ffe680 50%, #f5c842 60%, transparent)' }} />

            <div style={{ padding: '22px 24px 24px' }}>

              {/* Telefon */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 7, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(245,200,66,0.85)' }}>
                  Telefon raqam
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    width: 48, height: 48, flexShrink: 0, borderRadius: 12,
                    background: '#16a34a', display: 'grid', placeItems: 'center',
                    boxShadow: '0 4px 14px rgba(22,163,74,0.5)',
                  }}>
                    <Phone size={18} color="white" strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="tel"
                      readOnly
                      style={inputStyle(activeField === 'phone')}
                      placeholder="+998 90 123 45 67"
                      value={identifier}
                      onFocus={() => setActiveField('phone')}
                    />
                    {identifier && (
                      <button
                        type="button"
                        onClick={() => setIdentifier('')}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 2, display: 'grid', placeItems: 'center' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Parol */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 7, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(245,200,66,0.85)' }}>
                  Parol
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    width: 48, height: 48, flexShrink: 0, borderRadius: 12,
                    background: '#16a34a', display: 'grid', placeItems: 'center',
                    boxShadow: '0 4px 14px rgba(22,163,74,0.5)',
                  }}>
                    <Lock size={18} color="white" strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'}
                      readOnly
                      style={inputStyle(activeField === 'pass')}
                      placeholder="••••••••"
                      value={password}
                      onFocus={() => setActiveField('pass')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 2, display: 'grid', placeItems: 'center' }}
                    >
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* NumPad */}
              <NumPad
                onPress={handleNumPress}
                onDelete={handleNumDelete}
                onOk={handleNumOk}
                disabled={loading}
              />

              {/* Kirish tugmasi */}
              <button
                type="button"
                onClick={() => void handleLogin()}
                disabled={loading}
                style={{
                  marginTop: 14, width: '100%', height: 52, borderRadius: 12,
                  fontSize: 15, fontWeight: 900, letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  background: loading ? '#c9a030' : 'linear-gradient(180deg,#ffe04d 0%,#f5c000 60%,#d4a200 100%)',
                  color: '#0a1200', border: 'none', cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(245,192,0,0.5), inset 0 1px 0 rgba(255,255,255,0.35)',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? '⟳  Kirilmoqda…' : '→  KIRISH'}
              </button>
            </div>

            <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, #f5c842 40%, #ffe680 50%, #f5c842 60%, transparent)' }} />
          </div>

          <ServerUrlDisplay />
        </div>
      </div>
    </div>
  )
}
