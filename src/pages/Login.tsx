import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Phone, Lock } from 'lucide-react'
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
    <p className="mt-3 text-center text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
      {settings?.serverUrl ?? '…'}
    </p>
  )
}

export default function LoginPage(): JSX.Element {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const setServerAuth = useAuth((s) => s.setServerAuth)
  const loadMenu = useMenu((s) => s.load)
  const loadTables = useTables((s) => s.load)

  const handleLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
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
          await syncAll()
          navigate('/select-waiter', { replace: true })
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
    <div className="relative flex h-full overflow-hidden">
      {/* Background rasm */}
      <img
        src={loginBg}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: 'brightness(0.45) saturate(1.1)' }}
      />

      {/* Gradient overlay — blur yo'q, tez ishlaydi */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(135deg, rgba(0,20,0,0.7) 0%, rgba(5,25,5,0.55) 100%)' }}
      />

      {/* Chap — dekorativ vertikal chiziq */}
      <div className="absolute left-0 top-0 h-full w-1" style={{ background: 'linear-gradient(to bottom, transparent, #f5c842, transparent)' }} />
      <div className="absolute right-0 top-0 h-full w-1" style={{ background: 'linear-gradient(to bottom, transparent, #f5c842, transparent)' }} />

      {/* Markaziy konteyner */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center px-6">
        <div className="w-full max-w-[400px]">

          {/* Logo doirasi */}
          <div className="mb-4 flex justify-center">
            <div
              style={{
                width: 80, height: 80,
                borderRadius: '50%',
                border: '3px solid #f5c842',
                boxShadow: '0 0 0 6px rgba(245,200,66,0.12), 0 8px 32px rgba(0,0,0,0.6)',
                overflow: 'hidden',
              }}
            >
              <img src={logoImg} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>

          {/* Sarlavha */}
          <div className="mb-6 text-center">
            <h1 style={{
              fontSize: 34,
              fontWeight: 900,
              color: '#f5c842',
              fontFamily: 'Georgia, serif',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              lineHeight: 1.2,
              textShadow: '0 3px 12px rgba(0,0,0,0.8), 0 0 40px rgba(245,200,66,0.25)',
              margin: 0,
            }}>
              Sohil<br />Choyxonasi
            </h1>
            {/* Sariq chiziq */}
            <div style={{ margin: '12px auto 0', width: 60, height: 2, background: 'linear-gradient(to right, transparent, #f5c842, transparent)' }} />
          </div>

          {/* Karta — blur yo'q, solid dark */}
          <div style={{
            background: 'rgba(6,18,6,0.93)',
            border: '1px solid rgba(245,200,66,0.3)',
            borderRadius: 18,
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(245,200,66,0.08)',
          }}>
            {/* Yuqori sariq chiziq */}
            <div style={{ height: 3, background: 'linear-gradient(90deg, transparent, #f5c842 40%, #ffe680 50%, #f5c842 60%, transparent)' }} />

            <form onSubmit={(e) => void handleLogin(e)} style={{ padding: '24px 28px 28px' }}>

              {/* Telefon */}
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block', marginBottom: 8,
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: 'rgba(245,200,66,0.8)',
                }}>
                  Telefon raqam
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    width: 48, height: 48, flexShrink: 0,
                    borderRadius: 12, background: '#16a34a',
                    display: 'grid', placeItems: 'center',
                    boxShadow: '0 4px 14px rgba(22,163,74,0.5)',
                  }}>
                    <Phone size={18} color="white" strokeWidth={2.5} />
                  </div>
                  <input
                    type="text"
                    style={{
                      flex: 1, height: 48, borderRadius: 12,
                      padding: '0 16px', fontSize: 14,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'white', outline: 'none',
                      caretColor: '#f5c842',
                    }}
                    placeholder="+998 90 123 45 67"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={loading}
                    autoComplete="username"
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(245,200,66,0.7)'; e.target.style.background = 'rgba(255,255,255,0.09)' }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.background = 'rgba(255,255,255,0.06)' }}
                  />
                </div>
              </div>

              {/* Parol */}
              <div style={{ marginBottom: 22 }}>
                <label style={{
                  display: 'block', marginBottom: 8,
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: 'rgba(245,200,66,0.8)',
                }}>
                  Parol
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    width: 48, height: 48, flexShrink: 0,
                    borderRadius: 12, background: '#16a34a',
                    display: 'grid', placeItems: 'center',
                    boxShadow: '0 4px 14px rgba(22,163,74,0.5)',
                  }}>
                    <Lock size={18} color="white" strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'}
                      style={{
                        width: '100%', height: 48, borderRadius: 12,
                        padding: '0 44px 0 16px', fontSize: 14,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: 'white', outline: 'none',
                        caretColor: '#f5c842', boxSizing: 'border-box',
                      }}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      autoComplete="current-password"
                      onFocus={(e) => { e.target.style.borderColor = 'rgba(245,200,66,0.7)'; e.target.style.background = 'rgba(255,255,255,0.09)' }}
                      onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.background = 'rgba(255,255,255,0.06)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      style={{
                        position: 'absolute', right: 14, top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'rgba(255,255,255,0.4)', background: 'none',
                        border: 'none', cursor: 'pointer', padding: 0,
                        display: 'grid', placeItems: 'center',
                      }}
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Kirish tugmasi */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', height: 52, borderRadius: 12,
                  fontSize: 15, fontWeight: 900,
                  letterSpacing: '0.22em', textTransform: 'uppercase',
                  background: loading ? '#c9a030' : 'linear-gradient(180deg, #ffe04d 0%, #f5c000 60%, #d4a200 100%)',
                  color: '#0a1200', border: 'none', cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(245,192,0,0.5), inset 0 1px 0 rgba(255,255,255,0.35)',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? '⟳  Kirilmoqda…' : '→  KIRISH'}
              </button>
            </form>

            {/* Pastki sariq chiziq */}
            <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, #f5c842 40%, #ffe680 50%, #f5c842 60%, transparent)' }} />
          </div>

          <ServerUrlDisplay />
        </div>
      </div>
    </div>
  )
}
