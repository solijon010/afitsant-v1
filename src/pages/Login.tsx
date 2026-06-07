import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import loginBg from '@/assets/cccccccc (1)11.png'
import hisobchimLogo from '@/assets/logo.png'
import LoginForm from '@/components/LoginForm'
import { BarChart2, FileText, Users, Settings, ShieldCheck, UserCheck, Zap, TrendingUp } from 'lucide-react'

const BOTTOM_FEATURES = [
  { icon: <BarChart2 size={20} />, title: 'Sotuvlar nazorati', desc: 'Real vaqtda kuzatuv' },
  { icon: <FileText size={20} />, title: 'Hisobotlar', desc: 'Aniq va batafsil' },
  { icon: <Users size={20} />, title: 'Mijozlar bazasi', desc: 'Sodiqlikni oshiring' },
  { icon: <Settings size={20} />, title: 'Oson sozlash', desc: 'Tez va qulay ishga tushirish' },
  { icon: <ShieldCheck size={20} />, title: 'Xavfsiz va ishonchli', desc: "Ma'lumotlaringiz himoyada" },
]

const RIGHT_FEATURES = [
  { icon: <UserCheck size={22} />, title: 'Oson boshqaruv' },
  { icon: <Zap size={22} />, title: 'Tez va ishonchli' },
  { icon: <TrendingUp size={22} />, title: 'Sotuvlar nazorati' },
]

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

      {/* ── ASOSIY QATOR ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── CHAP: Login panel ── */}
        <div style={{
          width: 'clamp(280px, 26vw, 390px)',
          flexShrink: 0,
          background: '#080a08',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(20px, 3vh, 40px) clamp(18px, 2.5vw, 36px)',
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
            width: 'clamp(80px, 9vw, 115px)',
            height: 'clamp(80px, 9vw, 115px)',
            borderRadius: '50%',
            overflow: 'hidden',
            marginBottom: 'clamp(10px, 1.5vh, 16px)',
            flexShrink: 0,
            border: '3px solid #f5c842',
            boxShadow: '0 0 0 6px rgba(245,200,66,0.10), 0 0 32px rgba(245,200,66,0.20), 0 8px 32px rgba(0,0,0,0.9)',
          }}>
            <img src={hisobchimLogo} alt="Hisobchim" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          {/* Sarlavha */}
          <h1 style={{
            margin: '0 0 3px',
            fontSize: 'clamp(22px, 2.4vw, 32px)',
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
            margin: '0 0 clamp(14px, 2.5vh, 26px)',
            fontSize: 'clamp(7px, 0.75vw, 9px)',
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
            marginTop: 'clamp(10px, 1.5vh, 18px)',
            fontSize: 9,
            color: 'rgba(255,255,255,0.22)',
            letterSpacing: '0.05em',
            textAlign: 'center',
          }}>
            © 2025 Hisobchim · Barcha huquqlar himoyalangan
          </p>
        </div>

        {/* ── O'NG: Rasm + marketing ── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>

          {/* Fon rasm */}
          <img
            src={loginBg}
            alt=""
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              filter: 'brightness(0.82) saturate(1.15)',
            }}
          />
          {/* Gradient overlay */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(8,10,8,0.55) 0%, rgba(0,0,0,0.08) 30%, transparent 70%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, transparent 40%, rgba(0,0,0,0.15) 100%)' }} />

          {/* Marketing kontent — o'ng yuqori */}
          <div style={{
            position: 'absolute',
            top: 'clamp(20px, 5vh, 50px)',
            right: 'clamp(20px, 5vw, 80px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(8px, 1.5vh, 16px)',
            textAlign: 'center',
          }}>
            {/* Logo */}
            <div style={{
              width: 'clamp(70px, 9vw, 110px)',
              height: 'clamp(70px, 9vw, 110px)',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '2.5px solid rgba(245,200,66,0.7)',
              boxShadow: '0 0 24px rgba(245,200,66,0.25), 0 8px 32px rgba(0,0,0,0.5)',
            }}>
              <img src={hisobchimLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>

            {/* Sarlavha */}
            <div>
              <p style={{
                margin: 0,
                fontSize: 'clamp(16px, 2.2vw, 28px)',
                fontWeight: 800,
                color: '#ffffff',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                textShadow: '0 2px 16px rgba(0,0,0,0.8)',
                lineHeight: 1.2,
              }}>
                Biznesingiz uchun
              </p>
              <p style={{
                margin: '4px 0 0',
                fontSize: 'clamp(18px, 2.6vw, 32px)',
                fontWeight: 900,
                color: '#f5c842',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                textShadow: '0 0 20px rgba(245,200,66,0.5), 0 2px 16px rgba(0,0,0,0.8)',
              }}>
                Aqlli yechim!
              </p>
            </div>

            {/* 3 xususiyat */}
            <div style={{ display: 'flex', gap: 'clamp(12px, 2vw, 28px)', marginTop: 'clamp(4px, 1vh, 10px)' }}>
              {RIGHT_FEATURES.map((f) => (
                <div key={f.title} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 'clamp(44px, 5.5vw, 66px)',
                    height: 'clamp(44px, 5.5vw, 66px)',
                    borderRadius: '50%',
                    background: 'rgba(245,200,66,0.15)',
                    border: '1.5px solid rgba(245,200,66,0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f5c842',
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                  }}>
                    {f.icon}
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: 'clamp(9px, 1vw, 12px)',
                    fontWeight: 600,
                    color: '#ffffff',
                    textShadow: '0 1px 8px rgba(0,0,0,0.8)',
                    textAlign: 'center',
                    maxWidth: 80,
                    lineHeight: 1.3,
                  }}>
                    {f.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── PASTKI BAR ── */}
      <div style={{
        flexShrink: 0,
        height: 'clamp(54px, 7vh, 70px)',
        background: 'rgba(6,8,6,0.92)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(245,200,66,0.20)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'clamp(16px, 3vw, 40px)',
        padding: '0 clamp(20px, 3vw, 48px)',
        overflow: 'hidden',
      }}>
        {BOTTOM_FEATURES.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 0.8vw, 10px)', flexShrink: 0 }}>
            <span style={{ color: '#f5c842', flexShrink: 0, opacity: 0.9 }}>{f.icon}</span>
            <div>
              <p style={{ margin: 0, fontSize: 'clamp(10px, 1.1vw, 13px)', fontWeight: 700, color: '#ffffff', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                {f.title}
              </p>
              <p style={{ margin: 0, fontSize: 'clamp(8px, 0.8vw, 10px)', color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
                {f.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}
