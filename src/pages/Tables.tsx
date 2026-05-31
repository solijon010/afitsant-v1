import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Building2, LogOut, Settings as SettingsIcon, UtensilsCrossed, Utensils } from 'lucide-react'
import hisobchimLogo from '@/assets/logo.png'
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
    <div className="flex h-full" style={{ background: '#f0f2f5' }}>

      {/* ── CHAP SIDEBAR ── */}
      <aside style={{ width: 200, flexShrink: 0, background: '#1a2636', display: 'flex', flexDirection: 'column' }}>
        {/* Logo */}
        <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
            <img src={hisobchimLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
              {settings?.organizationName ?? 'Restaurant'}
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>POS</p>
          </div>
        </div>

        {/* Soat */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: 'monospace', letterSpacing: '-1px', lineHeight: 1 }}>{clock.time}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>:{clock.secs}</span>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{clock.date}</p>
        </div>

        {/* Xona turlari label */}
        <div style={{ padding: '16px 16px 8px' }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Xona turlari
          </p>
        </div>

        {/* Area list */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
          {/* Barchasi */}
          <button
            onClick={() => setActiveAreaId(null)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: 10, marginBottom: 2, border: 'none', cursor: 'pointer',
              background: activeAreaId === null ? '#e11d48' : 'transparent',
              color: activeAreaId === null ? '#fff' : 'rgba(255,255,255,0.65)',
              fontSize: 13, fontWeight: 600, transition: 'all .15s',
            }}
          >
            <span>Barchasi</span>
            {totalOccupied > 0 && (
              <span style={{ background: activeAreaId === null ? 'rgba(255,255,255,0.25)' : '#e11d48', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 7px', minWidth: 20, textAlign: 'center' }}>
                {totalOccupied}
              </span>
            )}
          </button>
          {areas.map((area) => {
            const occ = occupiedInArea(area.id)
            const active = area.id === activeAreaId
            return (
              <button key={area.id} onClick={() => setActiveAreaId(area.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 10, marginBottom: 2, border: 'none', cursor: 'pointer',
                  background: active ? '#e11d48' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                  fontSize: 13, fontWeight: 600, transition: 'all .15s',
                }}
              >
                <span>{area.name}</span>
                {occ > 0 && (
                  <span style={{ background: active ? 'rgba(255,255,255,0.25)' : '#e11d48', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 7px', minWidth: 20, textAlign: 'center' }}>
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
        {/* Top bar */}
        <div style={{ background: '#fff', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e9edf2', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {totalOccupied > 0 && (
              <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 10, padding: '6px 14px' }}>
                <p style={{ margin: 0, fontSize: 10, color: '#dc2626', fontWeight: 600 }}>{totalOccupied} ta band</p>
                <p style={{ margin: 0, fontSize: 13, color: '#dc2626', fontWeight: 800, fontFamily: 'monospace' }}>{fmtMoney(totalSum)} so'm</p>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBar />
            <button onClick={() => navigate('/settings')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <SettingsIcon size={15} /> Sozlamalar
            </button>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em' }}>{prefix}</span>
                      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{activeCount}/{tables.length} ta</span>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#111', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
              {fmtMoney(total)}{' '}
              <span style={{ fontSize: 12, fontWeight: 500, color: '#666' }}>so'm</span>
            </span>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
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
