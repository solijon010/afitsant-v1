import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Phone, Lock, Delete, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import loginBg from '@/assets/manzara-foto.png'
import logoImg from '@/assets/logo.png'


export default function LoginPage(): JSX.Element {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeField, setActiveField] = useState<'phone' | 'pass'>('phone')
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

  const press = (d: string): void => {
    if (activeField === 'phone') setIdentifier(v => v + d)
    else setPassword(v => v + d)
  }
  const del = (): void => {
    if (activeField === 'phone') setIdentifier(v => v.slice(0, -1))
    else setPassword(v => v.slice(0, -1))
  }
  const ok = (): void => {
    if (activeField === 'phone') setActiveField('pass')
    else void handleLogin()
  }

  const iOSBtn = (bg: string, shadow: string): React.CSSProperties => ({
    height: 50, borderRadius: 12, cursor: 'pointer',
    display: 'grid', placeItems: 'center', border: 'none',
    background: bg,
    boxShadow: `${shadow}, inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.2)`,
    opacity: loading ? 0.5 : 1, transition: 'opacity .1s',
  })

  const S = {
    numBtn: (variant: 'default'|'gold'|'red'|'blue' = 'default'): React.CSSProperties => {
      if (variant === 'gold') return {
        ...iOSBtn('linear-gradient(180deg,#ffe04d 0%,#f5c000 60%,#d4a200 100%)', '0 4px 16px rgba(245,192,0,0.45)'),
        fontSize: 15, fontWeight: 900, color: '#0a1200',
      }
      if (variant === 'red') return {
        ...iOSBtn('linear-gradient(145deg,#ff5f57 0%,#e53935 50%,#c62828 100%)', '0 4px 14px rgba(229,57,53,0.55)'),
        fontSize: 18, fontWeight: 700, color: 'white',
      }
      if (variant === 'blue') return {
        ...iOSBtn('linear-gradient(145deg,#64b5f6 0%,#1e88e5 50%,#1565c0 100%)', '0 4px 14px rgba(30,136,229,0.55)'),
        fontSize: 20, fontWeight: 700, color: 'white',
      }
      return {
        height: 50, borderRadius: 12, fontSize: 19, fontWeight: 700,
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'white', cursor: 'pointer', display: 'grid', placeItems: 'center',
        opacity: loading ? 0.5 : 1, transition: 'opacity .1s',
      }
    },
    input: (focused: boolean): React.CSSProperties => ({
      flex: 1, height: 48, borderRadius: 12,
      padding: '0 36px 0 14px', fontSize: 14,
      background: focused ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)',
      border: `1.5px solid ${focused ? 'rgba(245,200,66,0.85)' : 'rgba(255,255,255,0.1)'}`,
      boxShadow: focused ? '0 0 0 3px rgba(245,200,66,0.1)' : 'none',
      color: 'white', outline: 'none', caretColor: '#f5c842',
      boxSizing: 'border-box' as const,
    }),
  }

  return (
    /* position:fixed — body background ni to'liq yopadi */
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#060f06',
    }}>
      {/* Background rasm */}
      <img src={loginBg} alt="" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', filter: 'brightness(0.62) saturate(1.15)',
      }} />

      {/* Overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,12,2,0.42)' }} />

      {/* Chet chiziqlari */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 2, height: '100%', background: 'linear-gradient(to bottom,transparent 5%,#f5c842 50%,transparent 95%)' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, width: 2, height: '100%', background: 'linear-gradient(to bottom,transparent 5%,#f5c842 50%,transparent 95%)' }} />

      {/* Kontent */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 400, padding: '12px 20px', overflowY: 'auto', maxHeight: '100vh' }}>

        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 74, height: 74, borderRadius: '50%', border: '3px solid #f5c842', boxShadow: '0 0 0 5px rgba(245,200,66,0.13), 0 8px 28px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
            <img src={logoImg} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        {/* Sarlavha */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, lineHeight: 1.2, color: '#f5c842', fontFamily: 'Georgia,serif', letterSpacing: '0.1em', textTransform: 'uppercase', textShadow: '0 3px 12px rgba(0,0,0,0.9)' }}>
            Sohil<br />Choyxonasi
          </h1>
          <div style={{ margin: '10px auto 0', width: 50, height: 2, background: 'linear-gradient(to right,transparent,#f5c842,transparent)' }} />
        </div>

        {/* Karta */}
        <div style={{ background: '#060f06', border: '1px solid rgba(245,200,66,0.28)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(245,200,66,0.06)' }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg,transparent,#f5c842 40%,#ffe680 50%,#f5c842 60%,transparent)' }} />

          <div style={{ padding: '20px 20px 22px' }}>

            {/* Telefon input */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(245,200,66,0.8)' }}>
                Telefon raqam
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 14, background: 'linear-gradient(145deg,#34d058 0%,#22c55e 40%,#16a34a 100%)', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(22,163,74,0.55), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15)' }} onClick={() => setActiveField('phone')}>
                  <Phone size={20} color="white" strokeWidth={2} />
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type="text"
                    style={S.input(activeField === 'phone')}
                    placeholder="+998 90 123 45 67"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onFocus={() => setActiveField('phone')}
                  />
                  {identifier && activeField === 'phone' && (
                    <button type="button" onClick={() => setIdentifier('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 0, display: 'grid', placeItems: 'center' }}>
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Parol input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(245,200,66,0.8)' }}>
                Parol
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 14, background: 'linear-gradient(145deg,#34d058 0%,#22c55e 40%,#16a34a 100%)', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(22,163,74,0.55), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15)' }} onClick={() => setActiveField('pass')}>
                  <Lock size={20} color="white" strokeWidth={2} />
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    style={S.input(activeField === 'pass')}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setActiveField('pass')}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 0, display: 'grid', placeItems: 'center' }}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {/* NumPad: 1-9, +, 0, del, ✓ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
              {['1','2','3','4','5','6','7','8','9'].map(n => (
                <button key={n} type="button" disabled={loading} onClick={() => press(n)} style={S.numBtn()}>{n}</button>
              ))}
              {/* + — ko'k */}
              <button type="button" disabled={loading} onClick={() => press('+')} style={S.numBtn('blue')}>+</button>
              <button type="button" disabled={loading} onClick={() => press('0')} style={S.numBtn()}>0</button>
              {/* delete — qizil */}
              <button type="button" disabled={loading} onClick={del} style={S.numBtn('red')}>
                <Delete size={18} />
              </button>
              {/* OK — sariq, to'liq kenglik */}
              <button
                type="button"
                disabled={loading}
                onClick={ok}
                style={{ ...S.numBtn('gold'), gridColumn: '1 / -1', height: 52, fontSize: 14, letterSpacing: '0.18em' }}
              >
                {loading ? '⟳  Kirilmoqda…' : activeField === 'phone' ? '→  KEYINGISI' : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Check size={18} /> KIRISH</span>}
              </button>
            </div>
          </div>

          <div style={{ height: 2, background: 'linear-gradient(90deg,transparent,#f5c842 40%,#ffe680 50%,#f5c842 60%,transparent)' }} />
        </div>

      </div>
    </div>
  )
}
