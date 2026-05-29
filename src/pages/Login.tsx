import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Lock, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useMenu } from '@/stores/menu'
import { useTables } from '@/stores/tables'
import loginBg from '@/assets/manzara-foto.png'
import logoImg from '@/assets/logo.png'

/* ─── Yordamchi: bitta input ──────────────────────────────────── */
function Field({
  value, onChange, disabled, placeholder, type = 'text', autoComplete, right,
}: {
  value: string; onChange: (v: string) => void; disabled: boolean
  placeholder: string; type?: string; autoComplete?: string; right?: React.ReactNode
}): JSX.Element {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', height: 46, boxSizing: 'border-box' as const,
          background: 'rgba(0,0,0,0.32)',
          border: `1.5px solid ${focused ? 'rgba(212,160,20,0.7)' : 'rgba(74,140,63,0.4)'}`,
          borderRadius: 12,
          padding: right ? '0 44px 0 14px' : '0 14px',
          color: '#e8f5e9', fontFamily: 'monospace', fontSize: 15,
          outline: 'none', transition: 'border-color 0.2s',
        }}
      />
      {right && (
        <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)' }}>
          {right}
        </div>
      )}
    </div>
  )
}

function IconBox({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div style={{
      width:46, height:46, flexShrink:0,
      display:'grid', placeItems:'center',
      borderRadius:12,
      background:'linear-gradient(135deg,#1e6b20,#2d8c30)',
      boxShadow:'0 2px 10px rgba(45,140,48,0.45)',
    }}>{children}</div>
  )
}

/* ─── Asosiy komponent ───────────────────────────────────────── */
export default function LoginPage(): JSX.Element {
  const [identifier, setIdentifier] = useState('')
  const [password,   setPassword]   = useState('')
  const [showPass,   setShowPass]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const navigate    = useNavigate()
  const setServerAuth = useAuth(s => s.setServerAuth)
  const loadMenu    = useMenu(s => s.load)
  const loadTables  = useTables(s => s.load)

  const handleLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!identifier.trim() || !password.trim()) {
      toast.error('Login va parol kiriting'); return
    }
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
        if (!result.branches?.length) { toast.error('Filial topilmadi.'); return }
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
    } catch { toast.error('Ulanishda xatolik yuz berdi') }
    finally { setLoading(false) }
  }

  return (
    <>
      <style>{`
        @keyframes kenBurns {
          0%  { transform:scale(1)    translate(0,0);      }
          50% { transform:scale(1.07) translate(-1%,-0.5%);}
          100%{ transform:scale(1)    translate(0,0);      }
        }
        @keyframes fadeUp {
          from{ opacity:0; transform:translateY(20px); }
          to  { opacity:1; transform:translateY(0);    }
        }
        @keyframes floatLogo {
          0%,100%{ transform:translateY(0)    rotate(-2deg); }
          50%    { transform:translateY(-10px) rotate(2deg);  }
        }
        @keyframes glowPulse {
          0%,100%{ opacity:.55; }
          50%    { opacity:1;   }
        }
        @keyframes goldShimmer {
          0%  { background-position:200% center; }
          100%{ background-position:0%   center; }
        }
        .login-btn{ transition: transform .18s, box-shadow .18s; }
        .login-btn:hover:not(:disabled){ transform:translateY(-2px); box-shadow:0 8px 28px rgba(212,160,20,.55)!important; }
        .login-btn:disabled{ opacity:.65; cursor:not-allowed; }
      `}</style>

      <div style={{
        minHeight:'100vh', backgroundColor:'#030f06',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        position:'relative', overflow:'hidden',
      }}>
        {/* Fon + Ken Burns */}
        <div style={{ position:'absolute', inset:0, overflow:'hidden' }}>
          <div style={{
            position:'absolute', inset:'-5%',
            backgroundImage:`url(${loginBg})`,
            backgroundSize:'cover', backgroundPosition:'center',
            filter:'brightness(0.58) saturate(1.25)',
            animation:'kenBurns 20s ease-in-out infinite',
          }}/>
        </div>
        {/* Qora overlay */}
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.36)' }}/>
        {/* Oltin glow */}
        <div style={{
          position:'absolute', top:0, left:'50%', transform:'translateX(-50%)',
          width:700, height:350, pointerEvents:'none',
          background:'radial-gradient(ellipse at center top, rgba(212,160,20,0.16) 0%, transparent 70%)',
          animation:'glowPulse 2.5s ease-in-out infinite',
        }}/>

        {/* Kontent */}
        <div style={{
          position:'relative', zIndex:1,
          width:'100%', maxWidth:440, padding:'0 20px 28px',
          animation:'fadeUp .75s cubic-bezier(0.22,1,0.36,1) both',
        }}>
          {/* Logo */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:10 }}>
            <img src={logoImg} alt="logo" style={{
              width:68, height:68, borderRadius:'50%', objectFit:'cover',
              filter:'drop-shadow(0 0 18px rgba(212,160,20,.55))',
              animation:'floatLogo 4s ease-in-out infinite',
              border:'2px solid rgba(212,160,20,0.4)',
            }}/>
          </div>

          {/* Sarlavha */}
          <div style={{ textAlign:'center', fontFamily:'Georgia,serif', marginBottom:12 }}>
            <div style={{
              fontSize:38, fontWeight:800, letterSpacing:6, lineHeight:1.12,
              color:'#d4a020',
              textShadow:'0 0 32px rgba(212,160,20,.5), 2px 3px 0 rgba(0,0,0,.55)',
            }}>SOHIL</div>
            <div style={{
              fontSize:38, fontWeight:800, letterSpacing:6, lineHeight:1.12,
              background:'linear-gradient(180deg,#f0d060 0%,#d4a020 50%,#b8860b 100%)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
            }}>CHOYXONASI</div>
          </div>

          {/* 3 olmoscha bezak */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:'linear-gradient(to right,transparent,rgba(212,160,20,.6))' }}/>
            {[6,10,6].map((s,i) => (
              <div key={i} style={{
                width:s, height:s, transform:'rotate(45deg)',
                background:'#d4a020',
                boxShadow:`0 0 ${s+3}px rgba(212,160,20,${s>6?.9:.6})`,
              }}/>
            ))}
            <div style={{ flex:1, height:1, background:'linear-gradient(to left,transparent,rgba(212,160,20,.6))' }}/>
          </div>

          {/* Forma karta */}
          <div style={{
            background:'rgba(4,18,7,0.78)',
            backdropFilter:'blur(18px)', WebkitBackdropFilter:'blur(18px)',
            border:'1px solid rgba(212,160,20,0.22)',
            borderRadius:24, padding:24,
            boxShadow:'0 0 0 1px rgba(0,80,20,.3), 0 24px 64px rgba(0,0,0,.75)',
          }}>
            <form onSubmit={e => void handleLogin(e)}>
              {/* Telefon */}
              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', marginBottom:8, fontSize:11, fontWeight:700,
                  textTransform:'uppercase' as const, letterSpacing:2.5, color:'#7dc87f' }}>
                  Telefon raqam
                </label>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <IconBox><Phone size={18} color="white"/></IconBox>
                  <Field value={identifier} onChange={setIdentifier} disabled={loading}
                    placeholder="+998901234567" type="tel" autoComplete="tel"/>
                </div>
              </div>

              {/* Parol */}
              <div style={{ marginBottom:20 }}>
                <label style={{ display:'block', marginBottom:8, fontSize:11, fontWeight:700,
                  textTransform:'uppercase' as const, letterSpacing:2.5, color:'#7dc87f' }}>
                  Parol
                </label>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <IconBox><Lock size={18} color="white"/></IconBox>
                  <Field value={password} onChange={setPassword} disabled={loading}
                    placeholder="••••••••" type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    right={
                      <button type="button" onClick={() => setShowPass(v => !v)}
                        style={{ background:'none', border:'none', cursor:'pointer',
                          color:'rgba(125,200,127,.65)', display:'flex', alignItems:'center', padding:0 }}>
                        {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                      </button>
                    }
                  />
                </div>
              </div>

              {/* Kirish tugmasi */}
              <button type="submit" disabled={loading} className="login-btn" style={{
                width:'100%', height:48, border:'none', borderRadius:12,
                background:'linear-gradient(90deg,#9a7009,#d4a020,#f0c030,#d4a020,#9a7009)',
                backgroundSize:'200% auto',
                animation:'goldShimmer 3s linear infinite',
                color:'#1a0f00', fontSize:15, fontWeight:800,
                fontFamily:'Georgia,serif', textTransform:'uppercase' as const, letterSpacing:4,
                boxShadow:'0 4px 22px rgba(212,160,20,.42)', cursor:'pointer',
              }}>
                {loading ? '⟳  Kirish...' : '→  Kirish'}
              </button>
            </form>

          </div>

          {/* Footer */}
          <p style={{ marginTop:18, textAlign:'center', fontSize:10, letterSpacing:3,
            color:'rgba(212,160,20,.28)', textTransform:'uppercase' as const }}>
            ✦ Sohil Choyxonasi ✦
          </p>
        </div>
      </div>
    </>
  )
}
