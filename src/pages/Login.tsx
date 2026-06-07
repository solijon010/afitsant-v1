import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import loginBg from '@/assets/rasm.png'
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
      const isWaiterFamily =
        role === 'AFITSANT' || role === 'SUPER_AFITSANT' ||
        role === 'WAITER' || role === 'SUPER_WAITER' || role === 'MANAGER'

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
      if (isWaiterFamily || isSuperAdmin) navigate('/select-waiter', { replace: true })
      return true
    } catch {
      toast.error('Ulanishda xatolik yuz berdi')
      return false
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <style>{`
        @media (max-width: 768px) { .login-right { display: none !important; } .login-left { width: 100% !important; } }
      `}</style>

      {/* ── ASOSIY QATOR ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── CHAP: Login panel ── */}
        <div className="login-left" style={{
          width: 380,
          minWidth: 320,
          flexShrink: 0,
          background: '#080a08',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '36px 32px',
          position: 'relative',
          zIndex: 2,
          boxShadow: '6px 0 48px rgba(0,0,0,0.8)',
        }}>
          {/* Oltin chiziqlar — dekoratsiya */}
          <div style={{ position: 'absolute', left: 0, top: 0, width: 3, height: '100%', background: 'linear-gradient(to bottom, transparent 5%, #f5c842 50%, transparent 95%)' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, width: 1.5, height: '100%', background: 'linear-gradient(to bottom, transparent 5%, rgba(245,200,66,0.35) 50%, transparent 95%)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: 'linear-gradient(to right, #f5c842 0%, transparent 80%)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 3, background: 'linear-gradient(to right, #f5c842 0%, transparent 80%)' }} />

          {/* Logo */}
          <div style={{
            width: 110, height: 110,
            borderRadius: '50%',
            overflow: 'hidden',
            marginBottom: 14,
            flexShrink: 0,
            border: '3px solid #f5c842',
            boxShadow: '0 0 0 6px rgba(245,200,66,0.10), 0 0 32px rgba(245,200,66,0.20), 0 8px 32px rgba(0,0,0,0.9)',
          }}>
            <img src={hisobchimLogo} alt="Hisobchim" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          {/* Sarlavha */}
          <h1 style={{
            margin: '0 0 4px',
            fontSize: 30,
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            color: '#f5c842',
            fontFamily: 'Georgia, serif',
            textShadow: '0 0 24px rgba(245,200,66,0.35), 0 2px 12px rgba(0,0,0,1)',
          }}>
            Hisobchim
          </h1>
          <p style={{
            margin: '0 0 22px',
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(245,200,66,0.45)',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}>
            POS · Restoran tizimi
          </p>

          {/* Forma */}
          <div style={{ width: '100%' }}>
            <LoginForm onSubmit={handleSubmit} />
          </div>

          <p style={{
            marginTop: 16,
            fontSize: 9,
            color: 'rgba(255,255,255,0.22)',
            letterSpacing: '0.05em',
            textAlign: 'center',
          }}>
            © 2025 Hisobchim · Barcha huquqlar himoyalangan
          </p>
        </div>

        {/* ── O'NG: Rasm ── */}
        <div className="login-right" style={{
          flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0,
          background: '#0d0f0d',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img
            src={loginBg}
            alt=""
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              filter: 'brightness(0.92) saturate(1.1)',
            }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(8,10,8,0.4) 0%, transparent 30%)', pointerEvents: 'none' }} />
        </div>
      </div>


    </div>
  )
}
