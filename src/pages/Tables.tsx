import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
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

  const activeTables = useMemo(
    () => (activeAreaId !== null ? (grouped.get(activeAreaId) ?? []) : []),
    [grouped, activeAreaId]
  )

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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {activeTables.map((tw, i) => (
              <TableCard
                key={tw.table.id}
                tw={tw}
                idx={i}
                onClick={() => navigate(`/order/${tw.table.id}`)}
              />
            ))}
            {activeTables.length === 0 && activeAreaId !== null && (
              <div className="col-span-full flex h-48 items-center justify-center text-sm text-ink-dim">
                Bu xonada stollar yo'q
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function TableCard({
  tw,
  idx,
  onClick
}: {
  tw: TableWithOrder
  idx: number
  onClick: () => void
}): JSX.Element {
  const isOpen = !!tw.order
  const total = tw.order?.total ?? 0
  const itemCount = tw.order?.items.length ?? 0

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: idx * 0.02, duration: 0.18 }}
      whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'relative flex h-36 flex-col justify-between rounded-2xl border p-4 text-left transition-colors',
        isOpen
          ? 'border-brand-success/40 bg-white shadow-glow'
          : 'border-line bg-white shadow-card hover:border-line-strong'
      )}
    >
      {/* Yuqori rangli chiziq — band bo'lganda */}
      {isOpen && (
        <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-brand-success" />
      )}

      {/* Stol nomi va holati */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-bold text-ink leading-tight">{tw.table.name}</p>
          <p className={cn('mt-1 text-xs', isOpen ? 'text-brand-success' : 'text-ink-dim')}>
            {isOpen ? `${itemCount} mahsulot` : "Bo'sh"}
          </p>
        </div>
        {isOpen && (
          <span className="flex h-2.5 w-2.5 rounded-full bg-brand-success shadow-sm ring-2 ring-brand-success/25" />
        )}
      </div>

      {/* Pastki qism */}
      {isOpen ? (
        <div>
          <p className="text-lg font-bold text-ink">{fmtMoney(total)}</p>
          <p className="text-[11px] text-ink-dim">so'm</p>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-ink-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-dim/40" />
          Bo&apos;sh
        </div>
      )}
    </motion.button>
  )
}
