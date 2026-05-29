import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Phone, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import loginBg from '@/assets/manzara-foto.png'
import hisobchimLogo from '@/assets/hisobchim-logo.ico'

export default function LoginPage(): JSX.Element {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState<'phone'|'pass'|null>(null)
  const passRef = useRef<HTMLInputElement>(null)
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

  const inputStyle = (isFocused: boolean): React.CSSProperties => ({
    flex: 1, height: 52, borderRadius: 12,
    padding: '0 40px 0 14px', fontSize: 15,
    background: isFocused ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
    border: `1.5px solid ${isFocused ? 'rgba(245,200,66,0.9)' : 'rgba(255,255,255,0.12)'}`,
    boxShadow: isFocused ? '0 0 0 3px rgba(245,200,66,0.12)' : 'none',
    color: 'white', outline: 'none', caretColor: '#f5c842',
    boxSizing: 'border-box' as const, transition: 'all .2s',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060f06' }}>
      {/* Fon */}
      <img src={loginBg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.62) saturate(1.1)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,10,2,0.42)' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: 2, height: '100%', background: 'linear-gradient(to bottom,transparent 5%,#f5c842 50%,transparent 95%)' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, width: 2, height: '100%', background: 'linear-gradient(to bottom,transparent 5%,#f5c842 50%,transparent 95%)' }} />

      {/* Kontent */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 420, padding: '0 24px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ width: 78, height: 78, borderRadius: '50%', border: '3px solid #f5c842', boxShadow: '0 0 0 5px rgba(245,200,66,0.13), 0 8px 28px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
            <img src={hisobchimLogo} alt="Hisobchim" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
          </div>
        </div>

        {/* Sarlavha */}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0, lineHeight: 1.15, color: '#f5c842', fontFamily: 'Georgia,serif', letterSpacing: '0.1em', textTransform: 'uppercase', textShadow: '0 3px 12px rgba(0,0,0,0.9)' }}>
            Hisobchim<br />POS
          </h1>
          <div style={{ margin: '12px auto 0', width: 50, height: 2, background: 'linear-gradient(to right,transparent,#f5c842,transparent)' }} />
        </div>

        {/* Karta */}
        <div style={{ background: '#060f06', border: '1px solid rgba(245,200,66,0.28)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.85)' }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg,transparent,#f5c842 40%,#ffe680 50%,#f5c842 60%,transparent)' }} />

          <form onSubmit={(e) => { e.preventDefault(); void handleLogin() }} style={{ padding: '24px 22px 26px' }}>

            {/* Telefon */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 7, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(245,200,66,0.8)' }}>
                Telefon raqam
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div onClick={() => document.getElementById('login-phone')?.focus()}
                  style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 14, background: 'linear-gradient(145deg,#34d058,#22c55e,#16a34a)', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(22,163,74,0.5), inset 0 1px 0 rgba(255,255,255,0.3)' }}>
                  <Phone size={20} color="white" strokeWidth={2} />
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    id="login-phone"
                    type="tel"
                    inputMode="numeric"
                    style={inputStyle(focused === 'phone')}
                    placeholder="+998 90 123 45 67"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onFocus={() => setFocused('phone')}
                    onBlur={() => setFocused(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); passRef.current?.focus() } }}
                    disabled={loading}
                    autoComplete="username"
                  />
                  {identifier && (
                    <button type="button" onClick={() => setIdentifier('')}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 18, lineHeight: 1, padding: 0 }}>
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Parol */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 7, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(245,200,66,0.8)' }}>
                Parol
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div onClick={() => passRef.current?.focus()}
                  style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 14, background: 'linear-gradient(145deg,#34d058,#22c55e,#16a34a)', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(22,163,74,0.5), inset 0 1px 0 rgba(255,255,255,0.3)' }}>
                  <Lock size={20} color="white" strokeWidth={2} />
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    ref={passRef}
                    type={showPass ? 'text' : 'password'}
                    style={inputStyle(focused === 'pass')}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocused('pass')}
                    onBlur={() => setFocused(null)}
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0, display: 'grid', placeItems: 'center' }}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Kirish tugmasi */}
            <button type="submit" disabled={loading}
              style={{
                width: '100%', height: 54, borderRadius: 14, border: 'none', cursor: 'pointer',
                background: loading ? '#c9a030' : 'linear-gradient(180deg,#ffe04d 0%,#f5c000 55%,#d4a200 100%)',
                color: '#0a1200', fontSize: 15, fontWeight: 900,
                letterSpacing: '0.2em', textTransform: 'uppercase',
                boxShadow: '0 6px 22px rgba(245,192,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
                opacity: loading ? 0.7 : 1, transition: 'opacity .15s',
              }}>
              {loading ? '⟳  Kirilmoqda…' : '→  KIRISH'}
            </button>
          </form>

          <div style={{ height: 2, background: 'linear-gradient(90deg,transparent,#f5c842 40%,#ffe680 50%,#f5c842 60%,transparent)' }} />
        </div>
      </div>
    </div>
  )
}
