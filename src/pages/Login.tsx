import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import loginBg from '@/assets/manzara-foto.png'
import hisobchimLogo from '@/assets/logo.png'
import LoginForm from '@/components/LoginForm'

export default function LoginPage(): JSX.Element {
  const navigate = useNavigate()
  const setServerAuth = useAuth((s) => s.setServerAuth)
  const loadMenu = useMenu((s) => s.load)
  const loadTables = useTables((s) => s.load)

  const handleSubmit = async (identifier: string, password: string): Promise<boolean> => {
    try {
      const result = await window.afisant.auth.loginServer(identifier.trim(), password)
      if (!result.ok) { toast.error(result.message ?? 'Login xatosi'); return false }

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
        if (!result.branches || result.branches.length === 0) { toast.error('Filial topilmadi.'); return false }
        if (result.branches.length === 1) {
          await window.afisant.auth.selectBranch(result.branches[0].id, result.branches[0].name)
          toast.success(`${result.branches[0].name} fililiga ulandi`)
          await syncAll()
          navigate('/select-waiter', { replace: true })
        } else {
          navigate('/select-branch', { replace: true, state: { branches: result.branches } })
        }
        return true
      }

      await syncAll()
      if (role === 'SUPER_AFITSANT' || role === 'MANAGER' || isSuperAdmin) {
        navigate('/select-waiter', { replace: true })
      }
      return true
    } catch {
      toast.error('Ulanishda xatolik yuz berdi')
      return false
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#060f06]">

      {/* Fon rasmi */}
      <img
        src={loginBg}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: 'brightness(0.55) saturate(1.1)' }}
      />
      {/* Qorang'ilik overlay */}
      <div className="absolute inset-0 bg-black/35" />
      {/* Oltin chiziqlar */}
      <div className="absolute left-0 top-0 h-full w-0.5" style={{ background: 'linear-gradient(to bottom,transparent 5%,#f5c842 50%,transparent 95%)' }} />
      <div className="absolute right-0 top-0 h-full w-0.5" style={{ background: 'linear-gradient(to bottom,transparent 5%,#f5c842 50%,transparent 95%)' }} />

      {/* Kontent */}
      <div className="relative z-10 flex w-full max-w-[400px] flex-col items-center px-6">

        {/* Logo doira */}
        <div
          className="mb-5 overflow-hidden rounded-full"
          style={{
            width: 148, height: 148, flexShrink: 0,
            border: '3px solid #f5c842',
            boxShadow: '0 0 0 8px rgba(245,200,66,0.13), 0 10px 40px rgba(0,0,0,0.8)',
          }}
        >
          <img src={hisobchimLogo} alt="Hisobchim" className="h-full w-full object-cover" />
        </div>

        {/* Sarlavha */}
        <h1
          className="mb-6 text-[36px] font-black uppercase tracking-[0.12em]"
          style={{ color: '#f5c842', fontFamily: 'Georgia,serif', textShadow: '0 3px 14px rgba(0,0,0,0.95)' }}
        >
          Hisobchim
        </h1>

        {/* Login forma — oq karta */}
        <LoginForm onSubmit={handleSubmit} />

      </div>
    </div>
  )
}
