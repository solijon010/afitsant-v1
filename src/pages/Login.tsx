import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Coffee, Eye, EyeOff, Lock, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import { cn } from '@/lib/cn'

function ServerUrlDisplay(): JSX.Element {
  const { settings, load } = useSettings()
  useEffect(() => { if (!settings) void load() }, [settings, load])
  return (
    <p className="mt-4 text-center text-xs text-ink-dim">
      Server: {settings?.serverUrl ?? '…'}
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
    <div className="flex h-full flex-col items-center justify-center bg-bg-base px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-brand-primary/15 text-brand-primary shadow-glow-amber">
            <Coffee size={30} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">POS Tizimi</h1>
            <p className="mt-1 text-sm text-ink-soft">Tizimga kirish</p>
          </div>
        </div>

        <form onSubmit={(e) => void handleLogin(e)} className="card p-6 space-y-4">
          <div>
            <label className="label">Telefon raqam yoki login</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" size={16} />
              <input
                type="text"
                className={cn('input pl-10', loading && 'opacity-50')}
                placeholder="+998901234567"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={loading}
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="label">Parol</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" size={16} />
              <input
                type={showPass ? 'text' : 'password'}
                className={cn('input pl-10 pr-10', loading && 'opacity-50')}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-2"
          >
            {loading ? 'Kirilmoqda…' : 'Kirish'}
          </button>
        </form>

        <ServerUrlDisplay />
      </motion.div>
    </div>
  )
}
