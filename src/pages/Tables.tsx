import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Settings as SettingsIcon, UtensilsCrossed } from 'lucide-react'
import type { Area, TableWithOrder } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useTables } from '@/stores/tables'
import { fmtMoney, initials } from '@/lib/format'
import { cn } from '@/lib/cn'
import StatusBar from '@/components/StatusBar'

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

  // Birinchi area avtomatik tanlanadi
  useEffect(() => {
    if (areas.length > 0 && activeAreaId === null) {
      setActiveAreaId(areas[0].id)
    }
  }, [areas, activeAreaId])

  const grouped = useMemo(() => {
    const m = new Map<number, TableWithOrder[]>()
    for (const s of snapshot) {
      const arr = m.get(s.table.areaId) ?? []
      arr.push(s)
      m.set(s.table.areaId, arr)
    }
    return m
  }, [snapshot])

  const activeTables = useMemo(() => {
    const list = activeAreaId !== null ? (grouped.get(activeAreaId) ?? []) : []
    return [...list].sort((a, b) => {
      const na = parseInt(a.table.name.replace(/\D/g, '')) || 0
      const nb = parseInt(b.table.name.replace(/\D/g, '')) || 0
      return na !== nb ? na - nb : a.table.name.localeCompare(b.table.name)
    })
  }, [grouped, activeAreaId])

  const totalOccupied = snapshot.filter((s) => s.order?.status === 'open').length
  const totalSum = snapshot.reduce((acc, s) => acc + (s.order?.total ?? 0), 0)

  const occupiedInArea = (areaId: number): number =>
    (grouped.get(areaId) ?? []).filter((t) => !!t.order).length

  const handleLogout = (): void => {
    logout()
    navigate('/select-waiter', { replace: true })
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line bg-bg-card px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <UtensilsCrossed size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold text-ink">
              {settings?.organizationName ?? 'Afisant'}
            </h1>
            <p className="text-xs text-ink-soft">
              {waiter?.firstName} {waiter?.lastName} ·{' '}
              {waiter?.role === 'super_waiter'
                ? 'Super afitsant'
                : waiter?.role === 'manager'
                  ? 'Manager'
                  : 'Afitsant'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {totalOccupied > 0 && (
            <div className="rounded-xl border border-brand-success/25 bg-brand-success/8 px-4 py-2 text-right">
              <p className="text-[11px] font-medium text-brand-success/80">
                {totalOccupied} ta band
              </p>
              <p className="text-sm font-bold text-brand-success">
                {fmtMoney(totalSum)} so'm
              </p>
            </div>
          )}
          <StatusBar />
          <button
            onClick={() => navigate('/settings')}
            className="btn-ghost h-10 w-10 p-0"
            title="Sozlamalar"
          >
            <SettingsIcon size={16} />
          </button>
          <button
            onClick={handleLogout}
            className="btn-ghost h-10 w-10 p-0"
            title="Chiqish"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Area tabs */}
      {areas.length > 0 && (
        <nav className="flex items-center gap-2 overflow-x-auto border-b border-line bg-bg-card px-6 py-3">
          {areas.map((area) => {
            const occupied = occupiedInArea(area.id)
            const isActive = area.id === activeAreaId
            return (
              <button
                key={area.id}
                onClick={() => setActiveAreaId(area.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all',
                  isActive
                    ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/20'
                    : 'border border-line bg-bg text-ink-soft hover:border-line-strong hover:text-ink'
                )}
              >
                {area.name}
                {occupied > 0 && (
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                      isActive
                        ? 'bg-white/25 text-white'
                        : 'bg-brand-success/15 text-brand-success'
                    )}
                  >
                    {occupied}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      )}

      {/* Stollar */}
      <main className="flex-1 overflow-y-auto p-6">
        {areas.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <UtensilsCrossed className="mx-auto mb-3 text-ink-dim" size={40} />
              <p className="text-sm text-ink-soft">Xonalar topilmadi</p>
              <p className="mt-1 text-xs text-ink-dim">
                Sozlamalar → Serverdan sinxronlash
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
            {activeTables.map((tw, i) => (
              <TableCard
                key={tw.table.id}
                tw={tw}
                idx={i}
                onClick={() => navigate(`/order/${tw.table.id}`)}
              />
            ))}
            {activeTables.length === 0 && activeAreaId !== null && (
              <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192, fontSize: 14, color: '#94a3b8' }}>
                Bu xonada stollar yo'q
              </div>
            )}
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
  const [hovered, setHovered] = useState(false)

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    height: 144, borderRadius: 16, padding: '16px 18px',
    textAlign: 'left', cursor: 'pointer', border: 'none', outline: 'none',
    background: isOpen
      ? 'linear-gradient(145deg,#f0fdf4,#dcfce7)'
      : hovered ? '#f1f5f9' : '#ffffff',
    boxShadow: isOpen
      ? '0 4px 24px rgba(34,197,94,0.22), 0 1px 4px rgba(0,0,0,0.05)'
      : hovered
        ? '0 6px 20px rgba(0,0,0,0.1)'
        : '0 2px 8px rgba(0,0,0,0.07)',
    outline: isOpen ? '2px solid #22c55e' : hovered ? '2px solid #cbd5e1' : '2px solid #e2e8f0',
    outlineOffset: -2,
    transform: hovered ? 'translateY(-2px)' : 'none',
    transition: 'all .18s ease',
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={cardStyle}
    >
      {/* Yuqori rang chizig'i */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        borderRadius: '16px 16px 0 0',
        background: isOpen
          ? 'linear-gradient(90deg,#16a34a,#4ade80)'
          : '#e2e8f0',
      }} />

      {/* Stol nomi + status nuqta */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 4 }}>
        <div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isOpen ? '#14532d' : '#1e293b', lineHeight: 1.2 }}>
            {tw.table.name}
          </p>
          <p style={{ margin: '5px 0 0', fontSize: 12, fontWeight: 500, color: isOpen ? '#16a34a' : '#94a3b8' }}>
            {isOpen ? `${itemCount} ta mahsulot` : "Bo'sh"}
          </p>
        </div>
        <div style={{
          width: 12, height: 12, borderRadius: '50%', flexShrink: 0, marginTop: 4,
          background: isOpen ? '#22c55e' : '#cbd5e1',
          boxShadow: isOpen ? '0 0 0 4px rgba(34,197,94,0.2)' : 'none',
        }} />
      </div>

      {/* Pastki qism */}
      {isOpen ? (
        <div>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#15803d', letterSpacing: '-0.5px' }}>
            {fmtMoney(total)}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: '#4ade80', fontWeight: 500 }}>so'm</p>
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
