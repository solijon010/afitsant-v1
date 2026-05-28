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
    <p className="mt-4 text-center text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.25)' }}>
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
    if (!identifier.trim() || !password.trim()) {
      toast.error('Login va parol kiriting')
      return
    }
    setLoading(true)
    try {
      const result = await window.afisant.auth.loginServer(identifier.trim(), password)
      if (!result.ok) {
        toast.error(result.message ?? 'Login xatosi')
        return
      }
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
        if (!result.branches || result.branches.length === 0) {
          toast.error('Filial topilmadi. Avval filial yarating.')
          return
        }
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
      if (role === 'SUPER_AFITSANT' || role === 'MANAGER' || isSuperAdmin) {
        navigate('/select-waiter', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    } catch {
      toast.error('Ulanishda xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative flex h-full flex-col items-center justify-center px-6 overflow-hidden"
      style={{
        backgroundImage: `url(${loginBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0" style={{ background: 'rgba(5,12,5,0.62)' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.5) 100%)' }} />

      <div className="relative z-10 flex w-full max-w-[420px] flex-col items-center">

        {/* Logo */}
        <div
          className="mb-3 h-[72px] w-[72px] overflow-hidden rounded-full"
          style={{
            border: '2px solid rgba(255,255,255,0.6)',
            boxShadow: '0 0 24px rgba(0,0,0,0.5)',
          }}
        >
          <img src={logoImg} alt="logo" className="h-full w-full object-cover" />
        </div>

        {/* Sarlavha */}
        <h1
          className="mb-6 text-center text-[32px] font-black uppercase leading-tight tracking-[0.08em]"
          style={{
            color: '#f5c842',
            fontFamily: 'Georgia, serif',
            textShadow: '0 2px 16px rgba(0,0,0,0.7), 0 0 40px rgba(245,200,66,0.3)',
          }}
        >
          Sohil<br />Choyxonasi
        </h1>

        {/* Karta */}
        <div
          className="w-full rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(12,22,12,0.88)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <form onSubmit={(e) => void handleLogin(e)} className="p-6 space-y-4">

            {/* Telefon */}
            <div>
              <label
                className="mb-2 block text-[11px] font-bold tracking-[0.22em] uppercase"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >
                Telefon raqam
              </label>
              <div className="flex gap-2">
                <div
                  className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl"
                  style={{ background: '#22c55e', boxShadow: '0 4px 12px rgba(34,197,94,0.4)' }}
                >
                  <Phone size={18} color="white" />
                </div>
                <input
                  type="text"
                  className="flex-1 rounded-xl px-4 text-sm outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white',
                    caretColor: '#22c55e',
                    height: 48,
                  }}
                  placeholder="+998901234567"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                  onFocus={(e) => { e.target.style.borderColor = 'rgba(34,197,94,0.6)'; e.target.style.background = 'rgba(255,255,255,0.1)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(255,255,255,0.07)' }}
                />
              </div>
            </div>

            {/* Parol */}
            <div>
              <label
                className="mb-2 block text-[11px] font-bold tracking-[0.22em] uppercase"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >
                Parol
              </label>
              <div className="flex gap-2">
                <div
                  className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl"
                  style={{ background: '#22c55e', boxShadow: '0 4px 12px rgba(34,197,94,0.4)' }}
                >
                  <Lock size={18} color="white" />
                </div>
                <div className="relative flex-1">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="w-full rounded-xl px-4 pr-11 text-sm outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'white',
                      caretColor: '#22c55e',
                      height: 48,
                    }}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(34,197,94,0.6)'; e.target.style.background = 'rgba(255,255,255,0.1)' }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(255,255,255,0.07)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
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
              className="w-full rounded-xl py-4 text-[15px] font-black tracking-[0.2em] uppercase transition-all disabled:opacity-60 active:scale-[0.98]"
              style={{
                background: loading ? '#c9a030' : 'linear-gradient(135deg, #f5c842 0%, #e8b820 50%, #f5c842 100%)',
                color: '#0a1200',
                boxShadow: '0 6px 24px rgba(245,200,66,0.45)',
              }}
            >
              {loading ? '⟳  Kirilmoqda…' : '→  Kirish'}
            </button>
          </form>
        </div>

        <ServerUrlDisplay />
      </div>
    </div>
  )
}
