import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Clock,
  Coffee,
  Crown,
  LogOut,
  Printer,
  Settings as SettingsIcon,
  Sofa,
  Users
} from 'lucide-react'
import type { Area, TableWithOrder } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useTables } from '@/stores/tables'
import { fmtMoney, fmtTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import StatusBar from '@/components/StatusBar'

const AREA_ICON: Record<string, JSX.Element> = {
  sori: <Sofa size={16} />,
  xona: <Users size={16} />,
  katta_xona: <Crown size={16} />
}

const AREA_TONE: Record<string, string> = {
  sori: 'text-brand-success',
  xona: 'text-brand-purple',
  katta_xona: 'text-brand-primary'
}

export default function TablesPage(): JSX.Element {
  const navigate = useNavigate()
  const waiter = useAuth((s) => s.waiter)
  const logout = useAuth((s) => s.logout)
  const settings = useSettings((s) => s.settings)
  const { areas, snapshot, load } = useTables()
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

  const openCount = snapshot.filter((s) => s.order && s.order.status === 'open').length
  const openTotal = snapshot.reduce((acc, s) => acc + (s.order?.total ?? 0), 0)

  const handleLogout = (): void => {
    logout()
    navigate('/select-waiter', { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-primary/15 text-brand-primary">
            <Coffee size={20} />
          </div>
          <div>
            <h1 className="text-base font-semibold">{settings?.organizationName ?? 'Afisant'}</h1>
            <p className="text-xs text-ink-soft">
              {waiter ? `${waiter.firstName} ${waiter.lastName}` : ''} ·{' '}
              {waiter?.role === 'super_waiter' ? 'Super afitsant' : 'Afitsant'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {openCount > 0 && (
            <div className="rounded-2xl border border-brand-success/30 bg-brand-success/10 px-4 py-2 text-right">
              <p className="text-xs text-brand-success/90">{openCount} ta ochiq</p>
              <p className="text-sm font-semibold text-brand-success">{fmtMoney(openTotal)} so'm</p>
            </div>
          )}
          <StatusBar />
          <button onClick={() => navigate('/settings')} className="btn-ghost h-10 w-10 p-0" title="Sozlamalar">
            <SettingsIcon size={16} />
          </button>
          <button onClick={handleLogout} className="btn-ghost h-10 w-10 p-0" title="Chiqish">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 pb-8">
        {areas.map((area) => (
          <AreaBlock
            key={area.id}
            area={area}
            tables={grouped.get(area.id) ?? []}
            onPick={(id) => navigate(`/order/${id}`)}
          />
        ))}
      </main>
    </div>
  )
}

function AreaBlock({
  area,
  tables,
  onPick
}: {
  area: Area
  tables: TableWithOrder[]
  onPick: (tableId: number) => void
}): JSX.Element {
  const tone = AREA_TONE[area.type] ?? 'text-ink-soft'
  const bgMap: Record<string, string> = {
    sori: 'bg-brand-success/10 border-brand-success/20',
    xona: 'bg-brand-purple/10 border-brand-purple/20',
    katta_xona: 'bg-brand-primary/10 border-brand-primary/20'
  }
  const bgTone = bgMap[area.type] ?? 'bg-bg-elevated border-line'
  const occupied = tables.filter((t) => t.order).length

  return (
    <section className="mb-10">
      <div className={cn('mb-4 flex items-center gap-4 rounded-2xl border px-5 py-3', bgTone)}>
        <span className={cn('inline-flex items-center gap-2 text-base font-bold uppercase tracking-wide', tone)}>
          {AREA_ICON[area.type] ?? <Sofa size={16} />} {area.name}
        </span>
        {occupied > 0 && (
          <span
            className={cn(
              'rounded-full px-3 py-0.5 text-xs font-semibold',
              tone,
              'bg-current/10 border border-current/20'
            )}
          >
            {occupied} band
          </span>
        )}
        <span className="ml-auto text-sm text-ink-dim">{tables.length} ta xona</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {tables.map((tw, i) => (
          <TableCard
            key={tw.table.id}
            tw={tw}
            idx={i}
            tone={tone}
            onClick={() => onPick(tw.table.id)}
          />
        ))}
      </div>
    </section>
  )
}


function TableCard({
  tw,
  idx,
  onClick
}: {
  tw: TableWithOrder
  idx: number
  tone: string
  onClick: () => void
}): JSX.Element {
  const isOpen = !!tw.order

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.015 }}
      className="relative"
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
    >
      <button
        onClick={onClick}
        className={cn(
          'relative flex h-40 w-full flex-col justify-between rounded-2xl border-2 p-4 text-left transition-all duration-200',
          isOpen
            ? 'border-brand-danger bg-brand-danger shadow-[0_0_28px_rgba(239,68,68,0.5)]'
            : 'border-line bg-bg-card hover:border-line-strong hover:bg-bg-elevated'
        )}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className={cn('text-base font-bold leading-tight', isOpen && 'text-white')}>
              {tw.table.name}
            </p>
            <p className={cn('mt-0.5 text-xs', isOpen ? 'text-red-200' : 'text-ink-soft')}>
              {isOpen ? `${tw.order!.items.length} ta mahsulot` : "Bo'sh"}
            </p>
          </div>
          {isOpen && (
            <span className="mt-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
          )}
        </div>

        {isOpen ? (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs text-red-200">
              <Clock size={10} />
              <span>{fmtTime(tw.order!.openedAt)} dan beri</span>
            </div>
            <p className="text-2xl font-extrabold leading-tight text-white">
              {fmtMoney(tw.order!.total)}
            </p>
            <p className="text-xs font-semibold text-red-200">so'm</p>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-ink-dim">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-dim/40" />
            Bo&apos;sh
          </div>
        )}
      </button>
    </motion.div>
  )
}

