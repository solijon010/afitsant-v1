import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/stores/theme'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Building2, LogOut, Moon, Settings, Sun, UtensilsCrossed, Utensils, Wifi, User } from 'lucide-react'
import hisobchimLogo from '@/assets/logo.png'
import { useTheme } from '@/stores/theme'
import type { TableWithOrder } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useTables } from '@/stores/tables'
import { fmtMoney, fmtTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import StatusBar from '@/components/StatusBar'

/* ─── Soat hook ─── */
const UZ_DAYS = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba']
const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentyabr','Oktyabr','Noyabr','Dekabr']

function useClock() {
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setTick(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = tick.getHours()  // 0–23, 24-soatlik format (13:08, 00:00 va h.k.)
  return {
    time: `${pad(h)}:${pad(tick.getMinutes())}`,
    secs: pad(tick.getSeconds()),
    date: `${UZ_DAYS[tick.getDay()]}, ${tick.getDate()}-${UZ_MONTHS[tick.getMonth()]}`,
  }
}

/* ─── Animatsiya ─── */
const cardVariants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: (i: number) => ({
    opacity: 1, scale: 1,
    transition: { delay: i * 0.03, duration: 0.2, ease: 'easeOut' },
  }),
}

/* Stol nomidan prefix olish: "Tepa 1" → "Tepa" */
function getPrefix(name: string): string {
  return name.match(/^([^\d]+)/)?.[1]?.trim() ?? name
}

function sortTables(list: TableWithOrder[]): TableWithOrder[] {
  return [...list].sort((a, b) => {
    const pa = getPrefix(a.table.name)
    const pb = getPrefix(b.table.name)
    if (pa !== pb) return pb.localeCompare(pa, 'uz')
    const na = parseInt(a.table.name.replace(/\D/g, '')) || 0
    const nb = parseInt(b.table.name.replace(/\D/g, '')) || 0
    return na - nb
  })
}

type TableStatus = 'empty' | 'active' | 'waiting'

function getStatus(tw: TableWithOrder): TableStatus {
  if (!tw.order) return 'empty'
  return tw.order.status === 'open' ? 'active' : 'waiting'
}

export default function TablesPage(): JSX.Element {
  const navigate = useNavigate()
  const waiter = useAuth((s) => s.waiter)
  const settings = useSettings((s) => s.settings)
  const { areas, snapshot, load, activeAreaId, setActiveAreaId } = useTables()
  const { dark, toggle: toggleDark } = useTheme()

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  const grouped = useMemo(() => {
    const m = new Map<number, TableWithOrder[]>()
    for (const s of snapshot) {
      const arr = m.get(s.table.areaId) ?? []
      arr.push(s)
      m.set(s.table.areaId, arr)
    }
    return m
  }, [snapshot])

  /* Aktiv areadagi stollar — prefix bo'yicha guruhlangan */
  const groupedByPrefix = useMemo(() => {
    const list = activeAreaId !== null
      ? sortTables(grouped.get(activeAreaId) ?? [])
      : sortTables(Array.from(grouped.values()).flat())
    const map = new Map<string, TableWithOrder[]>()
    for (const tw of list) {
      const p = getPrefix(tw.table.name)
      const arr = map.get(p) ?? []
      arr.push(tw)
      map.set(p, arr)
    }
    return map
  }, [grouped, activeAreaId])

  const totalOccupied = snapshot.filter((s) => s.order?.status === 'open').length
  const totalSum = snapshot.reduce((acc, s) => acc + (s.order?.total ?? 0), 0)
  const occupiedInArea = (id: number) => (grouped.get(id) ?? []).filter((t) => !!t.order).length

  const roleLabel = waiter?.role === 'super_waiter' ? 'Super afitsant'
    : waiter?.role === 'manager' ? 'Manager' : 'Afitsant'

  const clock = useClock()

  return (
    <div className="flex h-full" style={{ background: '#1742a1' }}>

      {/* ── CHAP SIDEBAR ── */}
      <aside style={{ position: 'relative', width: 180, flexShrink: 0, background: '#1a2636', display: 'flex', flexDirection: 'column', borderRight: '2px solid rgba(255,255,255,0.15)', boxShadow: '6px 0px 0px rgba(0,0,0,0.4)', zIndex: 10 }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 12px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: '#fff' }}>
            <img src={hisobchimLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
              {settings?.organizationName ?? 'Restaurant'}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>POS</p>
          </div>
        </div>


        {/* Xona turlari label */}
        <div style={{ padding: '16px 16px 8px' }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Xona turlari
          </p>
        </div>

        {/* Area list */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Barchasi */}
          <button
            onClick={toggleDark}
            title={dark ? 'Yorqin rejim' : 'Qorong\'i rejim'}
            className="btn-ghost h-10 w-10 p-0"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-bg-card px-4 py-2.5 text-sm font-semibold text-ink hover:bg-bg-elevated hover:border-line-strong transition-all shadow-sm"
          >
            <span>Barchasi</span>
            {totalOccupied > 0 && (
              <span style={{ background: activeAreaId === null ? '#fff' : '#2563eb', color: activeAreaId === null ? '#2563eb' : '#fff', borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '2px 8px', minWidth: 24, textAlign: 'center' }}>
                {totalOccupied}
              </span>
            )}
          </button>
          {areas.map((area, idx) => {
            const occ = occupiedInArea(area.id)
            const active = area.id === activeAreaId
            const COLORS = [
              { bg: '#0EA5E9', light: '#E0F2FE', text: '#0284C7' }, // osmon ko'k
              { bg: '#8B5CF6', light: '#EDE9FE', text: '#7C3AED' }, // binafsha
              { bg: '#10B981', light: '#D1FAE5', text: '#059669' }, // emerald
              { bg: '#F59E0B', light: '#FEF3C7', text: '#D97706' }, // amber
              { bg: '#EF4444', light: '#FEE2E2', text: '#DC2626' }, // qizil
            ]
            const c = COLORS[idx % COLORS.length]
            return (
              <button key={area.id} onClick={() => setActiveAreaId(area.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.15)', cursor: 'pointer',
                  background: active ? '#2563eb' : '#cbd5e1',
                  color: active ? '#fff' : '#0f172a',
                  fontSize: 14, fontWeight: 700, transition: 'all .15s',
                  boxShadow: active ? '0px 0px 0px rgba(0,0,0,0)' : '3px 3px 0px rgba(0,0,0,0.3)',
                  transform: active ? 'translate(3px, 3px)' : 'none',
                }}
              >
                <span>{area.name}</span>
                {occ > 0 && (
                  <span style={{ background: active ? '#fff' : '#2563eb', color: active ? '#2563eb' : '#fff', borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '2px 8px', minWidth: 24, textAlign: 'center' }}>
                    {occ}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Foydalanuvchi + chiqish */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{waiter?.firstName} {waiter?.lastName}</p>
            <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{roleLabel}</p>
          </div>
          <button onClick={() => { useAuth.getState().logout(); navigate('/select-waiter', { replace: true }) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4, display: 'grid', placeItems: 'center' }}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── O'NG KONTENT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* ── TEPADAGI QISM (Top bar) ── */}
        <div style={{ position: 'relative', background: '#1a2636', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: '2px solid rgba(255,255,255,0.15)', boxShadow: '0px 6px 0px rgba(0,0,0,0.4)', zIndex: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {totalOccupied > 0 && (
              <div style={{ background: '#eab308', border: '2px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '4px 12px', color: '#0f172a', boxShadow: '3px 3px 0px rgba(0,0,0,0.4)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.85 }}>{totalOccupied} ta band</div>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 1, letterSpacing: '0.5px' }}>
                  {totalSum.toLocaleString()} so'm
                </div>
              </div>
            )}
          </div>

          {/* MARKAZDAGI SOAT */}
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px 20px', borderRadius: 10, background: '#0f172a', border: '2px solid rgba(255,255,255,0.15)', boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6), 0 2px 0 rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, lineHeight: 1 }}>
              <span style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: '1px', fontFamily: 'monospace' }}>{clock.time}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>:{clock.secs}</span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: 2 }}>{clock.date}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(22, 163, 74, 0.15)', padding: '6px 12px', borderRadius: 10 }}>
              <Wifi size={14} color="#4ade80" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#4ade80' }}>Onlayn</span>
            </div>
            
            <button onClick={() => navigate('/settings')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s' }}>
              <Settings size={16} color="#cbd5e1" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>Sozlamalar</span>
            </button>

            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid rgba(255,255,255,0.1)' }}>
              <User size={18} color="#cbd5e1" />
            </div>
          </div>
        </div>

        {/* Stollar */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {areas.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
              <UtensilsCrossed size={32} style={{ color: '#cbd5e1' }} />
              <p style={{ color: '#94a3b8', fontSize: 14 }}>Xonalar topilmadi</p>
            </div>
          ) : groupedByPrefix.size === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 14 }}>
              Bu xonada stollar yo'q
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {Array.from(groupedByPrefix.entries()).map(([prefix, tables]) => {
                const activeCount = tables.filter((t) => !!t.order).length
                return (
                  <section key={prefix}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{prefix}</span>
                      <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.15)' }} />
                      <span style={{ fontSize: 15, color: '#cbd5e1', fontWeight: 600 }}>{activeCount}/{tables.length} ta</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: 16 }}>
                      {tables.map((tw, i) => (
                        <TableCard key={tw.table.id} tw={tw} idx={i} onClick={() => navigate(`/order/${tw.table.id}`)} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

/* ─── Stol kartasi ─── */
function TableCard({
  tw, idx, onClick,
}: { tw: TableWithOrder; idx: number; onClick: () => void }): JSX.Element {
  const status = getStatus(tw)
  const total = tw.order?.total ?? 0
  const itemCount = tw.order?.items.length ?? 0
  const openedAt = tw.order?.openedAt

  const ACTIVE_COLOR = '#32b80d'
  const EMPTY_COLOR  = '#ab101a'

  const isActive  = status === 'active'
  const isEmpty   = status === 'empty'
  const accentColor = isActive ? ACTIVE_COLOR : EMPTY_COLOR

  return (
    <motion.button
      custom={idx}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -3, transition: { duration: 0.12 } }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: 'white',
        borderRadius: 20,
        border: `2px solid ${accentColor}22`,
        padding: '16px 16px 14px',
        textAlign: 'left',
        minHeight: 160,
        boxShadow: isActive
          ? `0 6px 24px ${ACTIVE_COLOR}30, 0 1px 4px rgba(0,0,0,0.06)`
          : `0 4px 16px ${EMPTY_COLOR}20, 0 1px 4px rgba(0,0,0,0.05)`,
        overflow: 'hidden',
        transition: 'all 0.18s ease',
      }}
    >
      {/* Yuqori rang chizig'i */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: accentColor, borderRadius: '18px 18px 0 0' }} />

      {/* BAND / BO'SH badge — yuqori o'ng burchak */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        background: accentColor, color: 'white',
        borderRadius: 8, padding: '3px 10px',
        fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        {isActive ? 'BAND' : "BO'SH"}
      </div>

      {/* Icon + Stol nomi */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: `${accentColor}1a`,
          display: 'grid', placeItems: 'center',
          border: `1.5px solid ${accentColor}30`,
        }}>
          {isActive
            ? <Building2 size={20} style={{ color: accentColor }} />
            : <Utensils size={20} style={{ color: accentColor }} />}
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#111', letterSpacing: '-0.3px' }}>
          {tw.table.name}
        </span>
      </div>

      {/* Separator */}
      <div style={{ height: 1, background: '#f0f0f0', marginBottom: 8 }} />

      {/* Ma'lumotlar */}
      {isEmpty ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f1f5f9', display: 'grid', placeItems: 'center' }}>
            <span style={{ fontSize: 20, color: '#94a3b8', lineHeight: 1 }}>+</span>
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Yangi buyurtma</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: `${ACTIVE_COLOR}18`, display: 'grid', placeItems: 'center' }}>
              <span style={{ fontSize: 9, color: ACTIVE_COLOR }}>📦</span>
            </div>
            <span style={{ fontSize: 12, color: '#333', fontWeight: 600 }}>{itemCount} ta mahsulot</span>
          </div>
          {openedAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: `${ACTIVE_COLOR}18`, display: 'grid', placeItems: 'center' }}>
                <span style={{ fontSize: 9, color: ACTIVE_COLOR }}>⏱</span>
              </div>
              <span style={{ fontSize: 12, color: '#555' }}>{fmtTime(openedAt)}</span>
            </div>
          )}
          {/* Summa + o'q tugma */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 4 }}>
            <span style={{ flex: 1, fontSize: 18, fontWeight: 900, color: '#111', fontFamily: 'monospace', letterSpacing: '-0.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {fmtMoney(total)}{' '}
              <span style={{ fontSize: 12, fontWeight: 500, color: '#666' }}>so'm</span>
            </span>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: ACTIVE_COLOR,
              display: 'grid', placeItems: 'center',
              boxShadow: `0 4px 12px ${ACTIVE_COLOR}50`,
            }}>
              <span style={{ color: 'white', fontSize: 16, fontWeight: 700, lineHeight: 1 }}>→</span>
            </div>
          </div>
        </div>
      )}
    </motion.button>
  )
}
