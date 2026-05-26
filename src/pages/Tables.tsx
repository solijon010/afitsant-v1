import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Coffee, Crown, LogOut, Settings as SettingsIcon, Sofa, Users } from 'lucide-react'
import type { Area, TableWithOrder } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'
import { useTables } from '@/stores/tables'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/cn'
import StatusBar from '@/components/StatusBar'

const AREA_ICON: Record<string, JSX.Element> = {
  sori: <Sofa size={14} />,
  xona: <Users size={14} />,
  katta_xona: <Crown size={14} />
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
    navigate('/login', { replace: true })
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
              {waiter ? `${waiter.firstName} ${waiter.lastName}` : ''} · {waiter?.role === 'super_waiter' ? 'Super afitsant' : 'Afitsant'}
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
          <AreaBlock key={area.id} area={area} tables={grouped.get(area.id) ?? []} onPick={(id) => navigate(`/order/${id}`)} />
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
  const occupied = tables.filter((t) => t.order).length

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-3">
        <span className={cn('inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider', tone)}>
          {AREA_ICON[area.type] ?? <Sofa size={14} />} {area.name}
        </span>
        {occupied > 0 && (
          <span className="chip">{occupied} band</span>
        )}
        <span className="ml-auto text-xs text-ink-dim">{tables.length} ta</span>
        <div className="ml-2 h-px flex-1 bg-line" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {tables.map((tw, i) => (
          <TableCard key={tw.table.id} tw={tw} idx={i} tone={tone} onClick={() => onPick(tw.table.id)} />
        ))}
      </div>
    </section>
  )
}

function TableCard({
  tw,
  idx,
  tone,
  onClick
}: {
  tw: TableWithOrder
  idx: number
  tone: string
  onClick: () => void
}): JSX.Element {
  const isOpen = !!tw.order
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.015 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'relative flex h-32 flex-col justify-between rounded-2xl border p-4 text-left transition-all',
        isOpen
          ? 'border-brand-success/40 bg-brand-success/5 shadow-glow'
          : 'border-line bg-bg-card hover:border-line-strong hover:bg-bg-elevated'
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold leading-tight">{tw.table.name}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {isOpen ? `${tw.order!.items.length} mahsulot` : "Bo'sh"}
          </p>
        </div>
        {isOpen && <span className="h-2 w-2 animate-pulse rounded-full bg-brand-success shadow-glow" />}
      </div>
      {isOpen && (
        <div className="text-right">
          <p className={cn('text-base font-semibold', tone)}>{fmtMoney(tw.order!.total)} so'm</p>
        </div>
      )}
    </motion.button>
  )
}
