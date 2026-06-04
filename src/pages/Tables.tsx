import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut, Settings, Wifi, ArrowRight, Clock, ShoppingBag, Plus } from 'lucide-react'
import hisobchimLogo from '@/assets/logo.png'
import type { TableWithOrder } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useTables } from '@/stores/tables'
import { fmtMoney, fmtTime } from '@/lib/format'

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
  const h = tick.getHours()
  return {
    time: `${pad(h)}:${pad(tick.getMinutes())}`,
    secs: pad(tick.getSeconds()),
    date: `${UZ_DAYS[tick.getDay()]}, ${tick.getDate()}-${UZ_MONTHS[tick.getMonth()]}`,
  }
}

const cardVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.03, duration: 0.18, ease: 'easeOut' },
  }),
}

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

  const groupedByPrefix = useMemo(() => {
    const list = activeAreaId !== null && activeAreaId !== -1
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

  /* ── Ranglar ── */
  const S = {
    sidebar: '#1e293b',
    sidebarBorder: 'rgba(255,255,255,0.07)',
    pageBackground: '#f1f5f9',
    topbar: '#ffffff',
    primary: '#2563eb',
    primaryMuted: '#eff6ff',
    success: '#16a34a',
    successMuted: '#f0fdf4',
    textPrimary: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: S.pageBackground }}>

      {/* ── CHAP SIDEBAR ── */}
      <aside style={{
        width: 196,
        flexShrink: 0,
        background: '#1e293b',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Logo */}
        <div style={{ padding: '14px 14px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <img src={hisobchimLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#ffffff', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {settings?.organizationName ?? 'Restaurant'}
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>POS tizimi</p>
          </div>
        </div>

        {/* Xona turlari label */}
        <div style={{ padding: '14px 14px 6px' }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Xona turlari
          </p>
        </div>

        {/* Area list */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <AreaButton
            label="Barchasi"
            count={totalOccupied}
            active={activeAreaId === -1 || activeAreaId === null}
            onClick={() => setActiveAreaId(-1)}
          />
          {areas.map((area) => (
            <AreaButton
              key={area.id}
              label={area.name}
              count={occupiedInArea(area.id)}
              active={area.id === activeAreaId}
              onClick={() => setActiveAreaId(area.id)}
            />
          ))}
        </nav>

        {/* Foydalanuvchi */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#ffffff', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {waiter?.firstName} {waiter?.lastName}
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{roleLabel}</p>
          </div>
          <button
            onClick={() => { useAuth.getState().logout(); navigate('/select-waiter', { replace: true }) }}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', color: 'rgba(255,255,255,0.85)', padding: 7, borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0, transition: 'background .15s' }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* ── O'NG KONTENT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          background: '#1e293b',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          height: 60,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
            {/* Chap: band stollar summasi */}
            <div>
              {totalOccupied > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.7)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
                    {totalOccupied} ta band
                  </span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>·</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                    {totalSum.toLocaleString()} so'm
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Barcha stollar bo'sh</span>
              )}
            </div>

            {/* Markaz: soat — kattaroq */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: '#ffffff', fontFamily: 'monospace', letterSpacing: '2px' }}>{clock.time}</span>
              <span style={{ fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>:{clock.secs}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginLeft: 8 }}>{clock.date}</span>
            </div>

            {/* O'ng: onlayn + sozlamalar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', padding: '5px 10px', borderRadius: 8 }}>
                <Wifi size={13} color="#ffffff" />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>Onlayn</span>
              </div>
              <button
                onClick={() => navigate('/settings')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', transition: 'background .15s' }}
              >
                <Settings size={14} color="rgba(255,255,255,0.85)" />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Sozlamalar</span>
              </button>
            </div>
        </div>

        {/* Stollar grid */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {groupedByPrefix.size === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8 }}>
              <p style={{ color: S.textMuted, fontSize: 14 }}>Bu xonada stollar yo'q</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {Array.from(groupedByPrefix.entries()).map(([prefix, tables]) => {
                const activeCount = tables.filter((t) => !!t.order).length
                return (
                  <section key={prefix}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: S.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{prefix}</span>
                      <div style={{ flex: 1, height: 1, background: S.border }} />
                      <span style={{ fontSize: 12, color: S.textMuted, fontWeight: 500 }}>{activeCount}/{tables.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(178px, 1fr))', gap: 12 }}>
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

/* ─── Sidebar area tugmasi ─── */
function AreaButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderRadius: 12,
        border: active ? '1.5px solid #2563eb' : '1.5px solid rgba(255,255,255,0.08)',
        cursor: 'pointer',
        background: active ? '#2563eb' : 'rgba(255,255,255,0.05)',
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 700,
        textAlign: 'left',
        boxShadow: active ? '0 2px 10px rgba(37,99,235,0.4)' : 'none',
      }}
    >
      <span>{label}</span>
      {count > 0 && (
        <span style={{
          background: active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
          color: '#fff',
          borderRadius: 99,
          fontSize: 11,
          fontWeight: 800,
          padding: '2px 8px',
          minWidth: 22,
          textAlign: 'center',
        }}>
          {count}
        </span>
      )}
    </button>
  )
}

/* ─── Stol kartasi ─── */
function TableCard({ tw, idx, onClick }: { tw: TableWithOrder; idx: number; onClick: () => void }): JSX.Element {
  const status = getStatus(tw)
  const total = tw.order?.total ?? 0
  const itemCount = tw.order?.items.length ?? 0
  const openedAt = tw.order?.openedAt
  const isActive = status === 'active'

  /* ── BO'SH ── */
  if (!isActive) {
    return (
      <motion.button
        custom={idx} variants={cardVariants} initial="hidden" animate="visible"
        whileHover={{ scale: 1.02, transition: { duration: 0.13 } }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10, background: '#fff', borderRadius: 18,
          border: '2px dashed #fca5a5', padding: '24px 16px',
          minHeight: 158, cursor: 'pointer', textAlign: 'center',
          boxShadow: 'none', transition: 'border .15s, box-shadow .15s',
        }}
      >
        <div style={{ width: 52, height: 52, borderRadius: 16, background: '#fef2f2', display: 'grid', placeItems: 'center' }}>
          <Plus size={24} color="#f87171" />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{tw.table.name}</p>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontWeight: 600 }}>Bo'sh · bosing</p>
        </div>
      </motion.button>
    )
  }

  /* ── BAND ── */
  return (
    <motion.button
      custom={idx} variants={cardVariants} initial="hidden" animate="visible"
      whileHover={{ y: -4, boxShadow: '0 20px 48px rgba(22,163,74,0.22)', transition: { duration: 0.13 } }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: 18,
        border: '1px solid #e2e8f0', padding: 0,
        minHeight: 158, cursor: 'pointer', textAlign: 'left',
        boxShadow: '0 6px 20px rgba(22,163,74,0.12)', overflow: 'hidden',
      }}
    >
      {/* Yuqori banner */}
      <div style={{ background: '#16a34a', padding: '14px 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(255,255,255,0.18)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <ShoppingBag size={18} color="#fff" />
        </div>
        <span style={{ fontSize: 17, fontWeight: 900, color: '#fff', letterSpacing: '-0.3px' }}>{tw.table.name}</span>
      </div>

      {/* Pastki qism */}
      <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', flex: 1, gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <ShoppingBag size={12} color="#86efac" />
          <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{itemCount} ta mahsulot</span>
        </div>
        {openedAt && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Clock size={12} color="#86efac" />
            <span style={{ fontSize: 12, color: '#64748b' }}>{fmtTime(openedAt)}</span>
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          <span style={{ fontSize: 21, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px', fontFamily: 'monospace' }}>{fmtMoney(total)}</span>
          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 3 }}>so'm</span>
        </div>
      </div>
    </motion.button>
  )
}
