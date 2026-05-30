import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut, Settings as SettingsIcon, UtensilsCrossed } from 'lucide-react'
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
    <div className="flex h-full flex-col" style={{ background: '#2f54a6' }}>

      {/* ── Header ── */}
      <header className="grid h-14 shrink-0 grid-cols-3 items-center border-b border-stone-100 bg-white px-6 shadow-sm">

        {/* Chap: Logo + foydalanuvchi */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm border border-stone-100">
            <img src={hisobchimLogo} alt="Hisobchim" className="h-7 w-7 object-contain" />
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-900 leading-tight">
              {settings?.organizationName ?? 'Hisobchim POS'}
            </p>
            <p className="text-[11px] text-stone-400 leading-tight">
              {waiter?.firstName} {waiter?.lastName} · {roleLabel}
            </p>
          </div>
        </div>

        {/* Markaz: Soat */}
        <div className="flex flex-col items-center justify-center">
          <div className="flex items-baseline gap-0.5">
            <span className="font-mono text-[22px] font-bold tabular-nums text-stone-800 leading-none">
              {clock.time}
            </span>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-stone-300 leading-none">
              :{clock.secs}
            </span>
          </div>
          <span className="mt-0.5 text-[10px] font-medium text-stone-400 leading-none tracking-wide">
            {clock.date}
          </span>
        </div>

        {/* O'ng: Statistika + tugmalar */}
        <div className="flex items-center justify-end gap-3">
          {totalOccupied > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-right">
              <p className="text-[10px] font-medium text-amber-600 leading-tight">{totalOccupied} ta band</p>
              <p className="font-mono text-sm font-bold text-amber-700 leading-tight">{fmtMoney(totalSum)} so'm</p>
            </div>
          )}
          <StatusBar />
          <button
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-bg-card px-4 py-2.5 text-sm font-semibold text-ink hover:bg-bg-elevated hover:border-line-strong transition-all shadow-sm"
          >
            <SettingsIcon size={16} />
            Sozlamalar
          </button>
          <button onClick={() => { useAuth.getState().logout(); navigate('/select-waiter', { replace: true }) }} className="btn-ghost h-10 w-10 p-0"><LogOut size={16} /></button>
        </div>
      </header>

      {/* ── Area tabs ── */}
      {areas.length > 1 && (
        <nav className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-stone-100 bg-white px-6 py-3">
          {areas.map((area) => {
            const occ = occupiedInArea(area.id)
            const active = area.id === activeAreaId
            return (
              <button
                key={area.id}
                onClick={() => setActiveAreaId(area.id)}
                className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all"
                style={active
                  ? { background: '#27ff44', color: '#0a1a0a', boxShadow: '0 2px 8px rgba(39,255,68,0.4)' }
                  : { background: 'rgba(255,255,255,0.15)', color: 'white' }}
              >
                {area.name}
                {occ > 0 && (
                  <span className={cn(
                    'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                    active ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700',
                  )}>
                    {occ}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      )}

      {/* ── Stollar ── */}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        {areas.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100">
                <UtensilsCrossed size={28} className="text-stone-300" />
              </div>
              <p className="text-sm font-medium text-stone-500">Xonalar topilmadi</p>
              <p className="mt-1 text-xs text-stone-400">Sozlamalar → Serverdan sinxronlash</p>
            </div>
          </div>
        ) : groupedByPrefix.size === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-stone-400">
            Bu xonada stollar yo'q
          </div>
        ) : (
          <div className="space-y-7">
            {Array.from(groupedByPrefix.entries()).map(([prefix, tables]) => {
              const activeCount = tables.filter((t) => !!t.order).length
              return (
                <section key={prefix}>
                  {/* Section sarlavha */}
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-5 w-1 rounded-full bg-[#C2410C]" />
                    <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">
                      {prefix}
                    </h2>
                    <div className="flex-1 h-px bg-stone-100" />
                    <span className="text-xs font-medium text-stone-400">
                      {activeCount}/{tables.length} band
                    </span>
                  </div>

                  <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
                  >
                    {tables.map((tw, i) => (
                      <TableCard
                        key={tw.table.id}
                        tw={tw}
                        idx={i}
                        onClick={() => navigate(`/order/${tw.table.id}`)}
                      />
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

      {/* BAND badge — yuqori o'ng burchak */}
      {isActive && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: ACTIVE_COLOR, color: 'white',
          borderRadius: 8, padding: '3px 10px',
          fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          BAND
        </div>
      )}

      {/* Icon + Stol nomi */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12, flexShrink: 0,
          background: `${accentColor}18`,
          display: 'grid', placeItems: 'center',
        }}>
          <UtensilsCrossed size={18} style={{ color: accentColor }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#111', letterSpacing: '-0.3px' }}>
          {tw.table.name}
        </span>
      </div>

      {/* Separator */}
      <div style={{ height: 1, background: '#f0f0f0', marginBottom: 8 }} />

      {/* Ma'lumotlar */}
      {isEmpty ? (
        <p style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>Bosing ochish uchun</p>
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
