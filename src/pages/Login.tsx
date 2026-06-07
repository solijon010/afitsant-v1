import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import loginBg from '@/assets/cccccccc (1)11.png'
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
        role === 'AFITSANT' ||
        role === 'SUPER_AFITSANT' ||
        role === 'WAITER' ||
        role === 'SUPER_WAITER' ||
        role === 'MANAGER'

      // Offline rejim: to'liq sync qilmasdan mahalliy bazadan yuklaymiz
      if (result.offline) {
        toast.info("Offline rejim — mahalliy ma'lumotlar ishlatilmoqda")
        await Promise.all([loadMenu(), loadTables()])
        navigate('/select-waiter', { replace: true })
        return true
      }

      const syncAll = async (): Promise<void> => {
        toast.loading("Ma'lumotlar yuklanmoqda…", { id: 'sync' })
        const res = await window.afisant.sync.fullPull()
        toast.dismiss('sync')
        if (!res.ok) toast.warning("Serverdan ma'lumot yuklab bo'lmadi — mahalliy ma'lumotlar")
        await Promise.all([loadMenu(), loadTables()])
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
      if (isWaiterFamily || isSuperAdmin) {
        navigate('/select-waiter', { replace: true })
      }
      return true
    } catch {
      toast.error('Ulanishda xatolik yuz berdi')
      return false
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>

      {/* ── CHAP: Forma panel ── */}
      <div style={{
        width: 400, flexShrink: 0,
        background: '#0a0d0a',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 36px',
        position: 'relative', zIndex: 2,
        boxShadow: '6px 0 40px rgba(0,0,0,0.7)',
      }}>
        {/* Oltin chiziqlar */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 3, height: '100%', background: 'linear-gradient(to bottom, transparent 5%, #f5c842 50%, transparent 95%)' }} />
        <div style={{ position: 'absolute', right: 0, top: 0, width: 2, height: '100%', background: 'linear-gradient(to bottom, transparent 5%, rgba(245,200,66,0.4) 50%, transparent 95%)' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: 'linear-gradient(to right, #f5c842 0%, transparent 100%)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 3, background: 'linear-gradient(to right, #f5c842 0%, transparent 100%)' }} />

        {/* Logo */}
        <div style={{
          width: 120, height: 120, borderRadius: '50%', overflow: 'hidden', marginBottom: 16, flexShrink: 0,
          border: '3px solid #f5c842',
          boxShadow: '0 0 0 7px rgba(245,200,66,0.12), 0 0 36px rgba(245,200,66,0.22), 0 10px 40px rgba(0,0,0,0.9)',
        }}>
          <img src={hisobchimLogo} alt="Hisobchim" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {/* Sarlavha */}
        <h1 style={{
          margin: '0 0 4px', fontSize: 34, fontWeight: 900, textTransform: 'uppercase',
          letterSpacing: '0.16em', color: '#f5c842',
          fontFamily: 'Georgia, serif',
          textShadow: '0 0 28px rgba(245,200,66,0.40), 0 3px 14px rgba(0,0,0,1)',
        }}>
          Hisobchim
        </h1>
        <p style={{ margin: '0 0 26px', fontSize: 10, fontWeight: 700, color: 'rgba(245,200,66,0.50)', letterSpacing: '0.28em', textTransform: 'uppercase' }}>
          POS · Restoran tizimi
        </p>

        {/* Forma */}
        <div style={{
          width: '100%',
          background: 'rgba(255,255,255,0.04)',
          border: '1.5px solid rgba(245,200,66,0.25)',
          borderRadius: 18, padding: '26px 24px 22px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <LoginForm onSubmit={handleSubmit} />
        </div>

        <p style={{ marginTop: 18, fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
          © 2025 Hisobchim · Barcha huquqlar himoyalangan
        </p>
      </div>

      {/* ── O'NG: Rasm ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <img
          src={loginBg}
          alt=""
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
            filter: 'brightness(0.88) saturate(1.1)',
          }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(10,13,10,0.60) 0%, rgba(0,0,0,0.05) 35%, transparent 100%)' }} />
      </div>

    </div>
  )
}
