import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Settings as SettingsIcon, UtensilsCrossed } from 'lucide-react'
import type { TableWithOrder } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useTables } from '@/stores/tables'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/cn'
import StatusBar from '@/components/StatusBar'

/* Stol nomidan prefix olish: "Tepa 1" → "Tepa", "Xona 7" → "Xona" */
function getPrefix(name: string): string {
  const m = name.match(/^([^\d]+)/)?.[1]?.trim()
  return m ?? name
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

export default function TablesPage(): JSX.Element {
  const navigate = useNavigate()
  const waiter = useAuth((s) => s.waiter)
  const logout = useAuth((s) => s.logout)
  const settings = useSettings((s) => s.settings)
  const { areas, snapshot, load } = useTables()
  const [activeAreaId, setActiveAreaId] = useState<number | null>(null)

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

  return (
    <div className="flex h-full flex-col bg-bg">

      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <UtensilsCrossed size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold text-ink">{settings?.organizationName ?? 'Afisant'}</h1>
            <p className="text-xs text-ink-soft">
              {waiter?.firstName} {waiter?.lastName} ·{' '}
              {waiter?.role === 'super_waiter' ? 'Super afitsant' : waiter?.role === 'manager' ? 'Manager' : 'Afitsant'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalOccupied > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-right">
              <p className="text-[11px] font-medium text-green-600">{totalOccupied} ta band</p>
              <p className="text-sm font-bold text-green-700">{fmtMoney(totalSum)} so'm</p>
            </div>
          )}
          <StatusBar />
          <button onClick={() => navigate('/settings')} className="btn-ghost h-10 w-10 p-0"><SettingsIcon size={16} /></button>
          <button onClick={() => { useAuth.getState().logout(); navigate('/select-waiter', { replace: true }) }} className="btn-ghost h-10 w-10 p-0"><LogOut size={16} /></button>
        </div>
      </header>

      {/* ── Area tabs ── */}
      {areas.length > 0 && (
        <nav className="flex items-center gap-3 overflow-x-auto border-b border-line bg-white px-6 py-3">
          {/* Barchasi tab */}
          <button
            onClick={() => setActiveAreaId(null)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all',
              activeAreaId === null
                ? 'bg-slate-800 text-white shadow-md'
                : 'border-2 border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-700'
            )}
          >
            Barchasi
            {totalOccupied > 0 && (
              <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                activeAreaId === null ? 'bg-white/25 text-white' : 'bg-green-100 text-green-700')}>
                {totalOccupied}
              </span>
            )}
          </button>

          {areas.map((area) => {
            const occ = occupiedInArea(area.id)
            const active = area.id === activeAreaId
            return (
              <button key={area.id} onClick={() => setActiveAreaId(area.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all',
                  active
                    ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20'
                    : 'border-2 border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-700'
                )}
              >
                {area.name}
                {occ > 0 && (
                  <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                    active ? 'bg-white/25 text-white' : 'bg-green-100 text-green-700')}>
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
              <UtensilsCrossed className="mx-auto mb-3 text-slate-300" size={40} />
              <p className="text-sm text-slate-500">Xonalar topilmadi</p>
              <p className="mt-1 text-xs text-slate-400">Sozlamalar → Serverdan sinxronlash</p>
            </div>
          </div>
        ) : groupedByPrefix.size === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-400">
            Bu xonada stollar yo'q
          </div>
        ) : (
          <div className="space-y-8">
            {Array.from(groupedByPrefix.entries()).map(([prefix, tables]) => (
              <section key={prefix}>
                {/* Kategoriya sarlavhasi */}
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-6 w-1 rounded-full bg-brand-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-widest text-slate-600">
                    {prefix}
                  </h2>
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-xs text-slate-400 font-medium">
                    {tables.filter(t => !!t.order).length}/{tables.length} band
                  </span>
                </div>

                {/* Karta grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 32 }}>
                  {tables.map((tw, i) => (
                    <TableCard key={tw.table.id} tw={tw} idx={i} onClick={() => navigate(`/order/${tw.table.id}`)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function TableCard({ tw, idx, onClick }: { tw: TableWithOrder; idx: number; onClick: () => void }): JSX.Element {
  const isOpen = !!tw.order
  const total = tw.order?.total ?? 0
  const itemCount = tw.order?.items.length ?? 0
  const [hov, setHov] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', height: 132,
        borderRadius: 14, padding: '14px 16px',
        textAlign: 'left', cursor: 'pointer',
        background: isOpen
          ? 'linear-gradient(145deg,#f0fdf4,#dcfce7)'
          : hov ? '#fee2e2' : '#fef2f2',
        border: `2px solid ${isOpen ? '#22c55e' : hov ? '#f87171' : '#fca5a5'}`,
        boxShadow: isOpen
          ? '0 4px 16px rgba(34,197,94,0.2)'
          : hov ? '0 6px 18px rgba(239,68,68,0.18)' : '0 2px 8px rgba(239,68,68,0.08)',
        transform: hov && !isOpen ? 'translateY(-2px)' : 'none',
        transition: 'all .16s ease',
      }}
    >
      {/* Yuqori chiziq */}
      <div style={{
        position: 'absolute', top: 0, left: 12, right: 12, height: 3,
        borderRadius: 99,
        background: isOpen ? 'linear-gradient(90deg,#16a34a,#4ade80)' : 'linear-gradient(90deg,#f87171,#ef4444)',
      }} />

      {/* Nomi + nuqta */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: isOpen ? '#15803d' : '#1e293b' }}>
          {tw.table.name}
        </p>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: isOpen ? '#22c55e' : '#ef4444',
          boxShadow: isOpen ? '0 0 0 3px rgba(34,197,94,0.2)' : '0 0 0 3px rgba(239,68,68,0.15)',
          flexShrink: 0,
        }} />
      </div>

      {/* Holat */}
      <p style={{ margin: '4px 0 0', fontSize: 12, color: isOpen ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
        {isOpen ? `${itemCount} ta mahsulot` : "Bo'sh"}
      </p>

      {/* Pastki */}
      {isOpen ? (
        <div>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#15803d', letterSpacing: '-0.5px' }}>
            {fmtMoney(total)} <span style={{ fontSize: 11, fontWeight: 500, color: '#4ade80' }}>so'm</span>
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#e2e8f0' }} />
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Bo'sh</span>
        </div>
      )}
    </button>
  )
}
