import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import { cn } from '@/lib/cn'
import loginBg from '@/assets/manzara-foto.png'
import logoImg from '@/assets/logo.png'

function ServerUrlDisplay(): JSX.Element {
  const { settings, load } = useSettings()
  useEffect(() => { if (!settings) void load() }, [settings, load])
  return (
    <p className="mt-5 text-center text-[11px] tracking-widest uppercase" style={{ color: '#b8975a99' }}>
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
      toast.error("Login va parol kiriting")
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
        if (!res.ok) {
          toast.error("Serverdan ma'lumot yuklab bo'lmadi")
        } else {
          await Promise.all([loadMenu(), loadTables()])
        }
      }

      if (isSuperAdmin && !hasBranch) {
        if (!result.branches || result.branches.length === 0) {
          toast.error("Filial topilmadi. Avval filial yarating.")
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
      {/* Overlay — rasm ko'rinib turadi */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(8,5,1,0.45)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)' }}
      />

      <div className="relative z-10 w-full max-w-[400px]">

        {/* Tashqi oltin çerçeve */}
        <div
          className="relative rounded-3xl p-[1px]"
          style={{
            background: 'linear-gradient(145deg, #c9a96e, #6b4c1e, #e8d09a, #6b4c1e, #c9a96e)',
            boxShadow: '0 0 60px rgba(201,169,110,0.22), 0 32px 80px rgba(0,0,0,0.65)',
          }}
        >
          {/* Ichki karta */}
          <div
            className="rounded-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(175deg, #1c1004 0%, #110a02 40%, #0d0701 100%)',
            }}
          >
            {/* Yuqori oltin chiziq — ingichka accent */}
            <div
              className="h-[3px] w-full"
              style={{ background: 'linear-gradient(90deg, transparent, #c9a96e 30%, #f0dc9a 50%, #c9a96e 70%, transparent)' }}
            />

            {/* Header */}
            <div className="flex flex-col items-center px-8 pt-8 pb-6">

              {/* Logo — uch halqali */}
              <div className="relative mb-5">
                {/* Tashqi halqa — punktir */}
                <div
                  className="absolute -inset-3 rounded-full"
                  style={{ border: '1px dashed rgba(201,169,110,0.25)' }}
                />
                {/* O'rta halqa */}
                <div
                  className="absolute -inset-1.5 rounded-full"
                  style={{ border: '1px solid rgba(201,169,110,0.18)' }}
                />
                {/* Logo doirasi */}
                <div
                  className="relative h-[100px] w-[100px] rounded-full overflow-hidden"
                  style={{
                    border: '2px solid rgba(201,169,110,0.65)',
                    boxShadow: '0 0 24px rgba(201,169,110,0.25), 0 0 48px rgba(201,169,110,0.08), inset 0 0 20px rgba(0,0,0,0.4)',
                  }}
                >
                  <img src={logoImg} alt="Sohil Choyhona" className="h-full w-full object-cover" />
                </div>
              </div>

              {/* Sarlavha */}
              <h1
                className="text-[24px] font-bold tracking-[0.2em] uppercase mt-1"
                style={{
                  color: '#e8d5a3',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  textShadow: '0 0 40px rgba(201,169,110,0.5), 0 2px 4px rgba(0,0,0,0.8)',
                }}
              >
                Sohil Choyhona
              </h1>

              {/* Subtitle chiziqli */}
              <div className="flex items-center gap-3 mt-3 w-full">
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(201,169,110,0.4))' }} />
                <span className="text-[9px] tracking-[0.35em] uppercase" style={{ color: '#c9a96e99' }}>
                  ✦ Tizimga kirish ✦
                </span>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(201,169,110,0.4))' }} />
              </div>
            </div>

            {/* Bezakli separator */}
            <div className="flex items-center gap-1.5 px-8 mb-0">
              <div className="flex-1 h-px" style={{ background: 'rgba(201,169,110,0.15)' }} />
              <span style={{ color: 'rgba(201,169,110,0.35)', fontSize: 10 }}>◆ ◆ ◆</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(201,169,110,0.15)' }} />
            </div>

            {/* Forma */}
            <form onSubmit={(e) => void handleLogin(e)} className="px-8 pt-6 pb-8 space-y-4">

              {/* Telefon */}
              <div>
                <label className="mb-2 flex items-center gap-2 text-[9px] font-bold tracking-[0.28em] uppercase" style={{ color: '#c9a96ecc' }}>
                  <span style={{ color: '#c9a96e66' }}>─</span>
                  Telefon yoki login
                  <span style={{ color: '#c9a96e66' }}>─</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm select-none" style={{ color: '#c9a96e70' }}>✆</span>
                  <input
                    type="text"
                    className={cn('w-full rounded-xl px-4 pl-10 py-3.5 text-sm outline-none transition-all', loading && 'opacity-50')}
                    style={{
                      background: 'rgba(201,169,110,0.04)',
                      border: '1px solid rgba(201,169,110,0.2)',
                      color: '#e8d5a3',
                      caretColor: '#c9a96e',
                      letterSpacing: '0.02em',
                    }}
                    placeholder="+998 90 123 45 67"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={loading}
                    autoComplete="username"
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(201,169,110,0.65)'; e.target.style.background = 'rgba(201,169,110,0.07)'; e.target.style.boxShadow = '0 0 0 3px rgba(201,169,110,0.08)' }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(201,169,110,0.2)'; e.target.style.background = 'rgba(201,169,110,0.04)'; e.target.style.boxShadow = 'none' }}
                  />
                </div>
              </div>

              {/* Parol */}
              <div>
                <label className="mb-2 flex items-center gap-2 text-[9px] font-bold tracking-[0.28em] uppercase" style={{ color: '#c9a96ecc' }}>
                  <span style={{ color: '#c9a96e66' }}>─</span>
                  Parol
                  <span style={{ color: '#c9a96e66' }}>─</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm select-none" style={{ color: '#c9a96e70' }}>⚿</span>
                  <input
                    type={showPass ? 'text' : 'password'}
                    className={cn('w-full rounded-xl px-4 pl-10 pr-11 py-3.5 text-sm outline-none transition-all', loading && 'opacity-50')}
                    style={{
                      background: 'rgba(201,169,110,0.04)',
                      border: '1px solid rgba(201,169,110,0.2)',
                      color: '#e8d5a3',
                      caretColor: '#c9a96e',
                    }}
                    placeholder="• • • • • • • •"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(201,169,110,0.65)'; e.target.style.background = 'rgba(201,169,110,0.07)'; e.target.style.boxShadow = '0 0 0 3px rgba(201,169,110,0.08)' }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(201,169,110,0.2)'; e.target.style.background = 'rgba(201,169,110,0.04)'; e.target.style.boxShadow = 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: 'rgba(201,169,110,0.5)' }}
                  >
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Tugma */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="relative w-full rounded-xl py-4 text-[13px] font-bold tracking-[0.25em] uppercase disabled:opacity-60 overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #b8884e 0%, #e8d09a 35%, #f5e6b0 50%, #e0c07a 65%, #a07040 100%)',
                    color: '#1c0e02',
                    boxShadow: '0 6px 28px rgba(201,169,110,0.4), 0 2px 0 rgba(255,255,255,0.15) inset, 0 -2px 0 rgba(0,0,0,0.2) inset',
                  }}
                >
                  {loading ? '⟳  Kirilmoqda…' : '✦  Kirish'}
                </button>
              </div>
            </form>

            {/* Pastki oltin chiziq */}
            <div
              className="h-[2px] w-full"
              style={{ background: 'linear-gradient(90deg, transparent, #c9a96e 30%, #f0dc9a 50%, #c9a96e 70%, transparent)' }}
            />
          </div>
        </div>

        <ServerUrlDisplay />
      </div>
    </div>
  )
}
