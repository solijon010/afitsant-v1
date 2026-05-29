import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'

export default function LoginPage(): JSX.Element {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState<'phone' | 'pass' | null>(null)
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

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f5f5',
    }}>

      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 380, padding: '0 20px' }}>

        {/* Sarlavha */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            margin: 0, fontSize: 30, fontWeight: 800,
            color: '#1a1a1a', letterSpacing: '-0.5px',
          }}>
            Sohil Choyxona
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#888' }}>
            Tizimga kirish
          </p>
        </div>

        {/* Karta */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e8e8e8',
          borderRadius: 20,
          padding: '28px 24px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
          <form onSubmit={(e) => { e.preventDefault(); void handleLogin() }}>

            {/* Telefon */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#999', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Telefon raqam
              </label>
              <input
                id="login-phone"
                type="tel"
                inputMode="numeric"
                placeholder="+998 90 123 45 67"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onFocus={() => setFocused('phone')}
                onBlur={() => setFocused(null)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); passRef.current?.focus() } }}
                disabled={loading}
                autoComplete="username"
                style={{
                  width: '100%', height: 50, borderRadius: 12,
                  padding: '0 16px', fontSize: 15,
                  background: '#fafafa',
                  border: `1.5px solid ${focused === 'phone' ? '#d4622a' : '#e0e0e0'}`,
                  boxShadow: focused === 'phone' ? '0 0 0 3px rgba(212,98,42,0.08)' : 'none',
                  color: '#1a1a1a', outline: 'none', caretColor: '#d4622a',
                  boxSizing: 'border-box', transition: 'all .2s',
                }}
              />
            </div>

            {/* Parol */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#999', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Parol
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={passRef}
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused(null)}
                  disabled={loading}
                  autoComplete="current-password"
                  style={{
                    width: '100%', height: 50, borderRadius: 12,
                    padding: '0 44px 0 16px', fontSize: 15,
                    background: '#fafafa',
                    border: `1.5px solid ${focused === 'pass' ? '#d4622a' : '#e0e0e0'}`,
                    boxShadow: focused === 'pass' ? '0 0 0 3px rgba(212,98,42,0.08)' : 'none',
                    color: '#1a1a1a', outline: 'none', caretColor: '#d4622a',
                    boxSizing: 'border-box', transition: 'all .2s',
                  }}
                />
                <button type="button" onClick={() => setShowPass(v => !v)} style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#aaa', padding: 0, display: 'grid', placeItems: 'center',
                }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Tugma */}
            <button type="submit" disabled={loading} style={{
              width: '100%', height: 52, borderRadius: 14,
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading
                ? 'rgba(212,98,42,0.4)'
                : 'linear-gradient(135deg, #e8763a 0%, #d4622a 100%)',
              color: 'white', fontSize: 15, fontWeight: 700,
              letterSpacing: '0.04em',
              boxShadow: loading ? 'none' : '0 8px 24px rgba(212,98,42,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all .2s', opacity: loading ? 0.6 : 1,
            }}>
              {loading ? 'Kirilmoqda…' : <><span>Kirish</span><ArrowRight size={18} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
