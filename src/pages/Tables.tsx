import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut, Moon, Settings as SettingsIcon, Sun, UtensilsCrossed } from 'lucide-react'
import { useTheme } from '@/stores/theme'
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
    <div className="flex h-full flex-col bg-[#F5F5F4]">

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
            <SettingsIcon size={16} />
            Sozlamalar
          </button>
          <button onClick={() => { useAuth.getState().logout(); navigate('/select-waiter', { replace: true }) }} className="btn-ghost h-10 w-10 p-0"><LogOut size={16} /></button>
        </div>
      </header>

      {/* ── Area tabs ── */}
      {areas.length > 1 && (
        <nav className="flex shrink-0 items-center gap-[8px] overflow-x-auto border-b border-stone-100 bg-white px-6 py-3">
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
              <button
                key={area.id}
                onClick={() => setActiveAreaId(area.id)}
                style={{
                  background: active ? c.bg : c.light,
                  color: active ? '#fff' : c.text,
                  border: `1.5px solid ${active ? c.bg : c.bg + '40'}`,
                  boxShadow: active ? `0 2px 8px ${c.bg}40` : 'none',
                }}
                className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all"
              >
                {area.name}
                {occ > 0 && (
                  <span
                    style={{
                      background: active ? 'rgba(255,255,255,0.25)' : c.bg,
                      color: active ? '#fff' : '#fff',
                    }}
                    className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
                  >
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

  /* Rang konfiguratsiyasi */
  const cfg = {
    empty: {
      bg: 'bg-white',
      border: 'border-stone-100 hover:border-stone-300',
      bar: 'bg-stone-200',
      dot: 'bg-stone-300',
      label: 'Bo\'sh',
      labelColor: 'text-stone-400',
      badgeBg: 'bg-stone-50',
      badgeText: 'text-stone-500',
    },
    active: {
      bg: 'bg-amber-50',
      border: 'border-amber-200 hover:border-amber-400',
      bar: 'bg-amber-400',
      dot: 'bg-amber-400',
      label: 'Band',
      labelColor: 'text-amber-700',
      badgeBg: 'bg-amber-100',
      badgeText: 'text-amber-700',
    },
    waiting: {
      bg: 'bg-red-50',
      border: 'border-red-200 hover:border-red-300',
      bar: 'bg-red-400',
      dot: 'bg-red-400',
      label: 'Kutmoqda',
      labelColor: 'text-red-600',
      badgeBg: 'bg-red-100',
      badgeText: 'text-red-700',
    },
  }[status]

  return (
    <motion.button
      custom={idx}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -2, transition: { duration: 0.12 } }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'relative flex flex-col justify-between rounded-xl border-2 p-4 text-left shadow-card transition-all hover:shadow-card-hover',
        cfg.bg,
        cfg.border,
      )}
      style={{ minHeight: 128 }}
    >
      {/* Status bar — tepada */}
      <div className={cn('absolute left-0 right-0 top-0 h-[3px] rounded-t-xl', cfg.bar)} />

      {/* Sarlavha + badge */}
      <div className="mt-1 flex items-start justify-between gap-2">
        <span className="text-[15px] font-bold text-stone-800">{tw.table.name}</span>
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
          cfg.badgeBg, cfg.badgeText,
        )}>
          <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
          {cfg.label}
        </span>
      </div>

      {/* Ma'lumotlar */}
      {status === 'empty' ? (
        <p className="mt-2 text-xs text-stone-400">Bosing ochish uchun</p>
      ) : (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-stone-500">{itemCount} ta mahsulot</p>
          {openedAt && (
            <p className="text-xs text-stone-400">{fmtTime(openedAt)}</p>
          )}
          <p className="mt-1 font-mono text-base font-bold text-[#C2410C]">
            {fmtMoney(total)}{' '}
            <span className="text-xs font-medium text-stone-400">so'm</span>
          </p>
        </div>
      )}
    </motion.button>
  )
}
