import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ChefHat,
  CupSoda,
  Flame,
  Leaf,
  Minus,
  Package,
  Plus,
  Printer,
  Save,
  ShoppingCart,
  Trash2,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import type { Category, Product, ReceiptPayload, TableEntity } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useCart, type CartLine } from '@/stores/cart'
import { useMenu } from '@/stores/menu'
import { useSettings } from '@/stores/settings'
import { useTables } from '@/stores/tables'
import { useCartFlush } from '@/hooks/useCartFlush'
import { fmtMoney, fmtQty } from '@/lib/format'
import { cn } from '@/lib/cn'

const CAT_ICON: Record<string, JSX.Element> = {
  package: <Package size={16} />,
  leaf: <Leaf size={16} />,
  plus: <Plus size={16} />,
  'cup-soda': <CupSoda size={16} />,
  flame: <Flame size={16} />,
  'chef-hat': <ChefHat size={16} />
}

export default function OrderPage(): JSX.Element {
  const { tableId } = useParams<{ tableId: string }>()
  const tId = Number(tableId)
  const navigate = useNavigate()
  const waiter = useAuth((s) => s.waiter)!
  const { categories, products } = useMenu()
  const settings = useSettings((s) => s.settings)
  const refreshTable = useTables((s) => s.refreshTable)

  const cart = useCart()
  const { flushNow } = useCartFlush()

  const [activeCatId, setActiveCatId] = useState<number | null>(null)
  const [table, setTable] = useState<TableEntity | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!activeCatId && categories[0]) setActiveCatId(categories[0].id)
  }, [categories, activeCatId])

  useEffect(() => {
    void window.afisant.tables.list().then((list) => setTable(list.find((t) => t.id === tId) ?? null))
  }, [tId])

  useEffect(() => {
    if (!waiter || !tId) return
    let cancelled = false
    void (async () => {
      const fee = settings?.serviceFeePercent ?? 1
      useCart.setState({ serviceFeePercent: fee })
      const order = await window.afisant.orders.upsert({
        tableId: tId,
        waiterId: waiter.id,
        serviceFeePercent: fee
      })
      if (cancelled) return
      const existing = await window.afisant.tables.getByTable(tId)
      cart.setOrder(order.id, tId)
      if (existing) {
        cart.hydrateFromOrder(
          existing.items.map<CartLine>((it) => ({
            localUuid: it.localUuid,
            productId: it.productId,
            productName: it.productName,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            notes: it.notes,
            flushed: true,
            itemId: it.id,
            addedAt: it.createdAt
          }))
        )
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tId, waiter?.id, settings?.serviceFeePercent])

  const shownProducts = useMemo<Product[]>(
    () => products.filter((p) => p.categoryId === activeCatId),
    [products, activeCatId]
  )

  const handleSave = async (): Promise<void> => {
    await flushNow()
    await refreshTable(tId)
    toast.success('Buyurtma saqlandi')
    navigate('/tables')
  }

  const handleCloseAndPrint = async (): Promise<void> => {
    if (!cart.orderId || !table || !waiter) return
    if (cart.lines.length === 0) {
      toast.error("Savat bo'sh")
      return
    }
    setPrinting(true)
    try {
      await flushNow()
      const payload: ReceiptPayload = {
        organizationName: settings?.organizationName ?? 'Choyxona',
        tableName: table.name,
        waiterName: `${waiter.firstName} ${waiter.lastName}`,
        orderLocalUuid: String(cart.orderId),
        items: cart.lines.map((l) => ({
          name: l.productName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          total: Math.round(l.unitPrice * l.quantity)
        })),
        subtotal: cart.subtotal(),
        serviceFeePercent: cart.serviceFeePercent,
        serviceFee: cart.serviceFee(),
        total: cart.total(),
        printedAt: Date.now(),
        receiptHeader: settings?.receiptHeader ?? null,
        receiptFooter: settings?.receiptFooter ?? null
      }
      const res = await window.afisant.printer.receipt(payload)
      if (!res.ok && settings?.printerType) {
        toast.error('Chek chiqarib bo\'lmadi', { description: (res as any).error })
      } else if (!res.ok) {
        toast.message('Printer ulanmagan — chek o\'tkazib yuborildi')
      } else {
        toast.success('Chek chiqdi')
      }

      await window.afisant.orders.close(cart.orderId)
      cart.clear()
      cart.setOrder(null, null)
      await refreshTable(tId)
      navigate('/tables')
    } finally {
      setPrinting(false)
      setConfirmClose(false)
    }
  }

  if (!table) {
    return (
      <div className="grid h-full place-items-center">
        <div className="card h-24 w-72 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-[1fr_380px]">
      <section className="flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4">
          <button onClick={() => navigate('/tables')} className="btn-ghost">
            <ArrowLeft size={16} /> Orqaga
          </button>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-ink-soft">STOL</p>
            <p className="text-lg font-semibold">{table.name}</p>
          </div>
          <div className="w-[100px]" />
        </header>

        <nav className="flex gap-2 overflow-x-auto px-6 pb-3">
          {categories.map((c) => (
            <CategoryPill
              key={c.id}
              cat={c}
              active={c.id === activeCatId}
              onClick={() => setActiveCatId(c.id)}
            />
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shownProducts.map((p, idx) => (
              <ProductCard key={p.id} product={p} idx={idx} />
            ))}
          </div>
        </div>
      </section>

      <CartPanel
        table={table}
        onSave={handleSave}
        onClosePrint={() => setConfirmClose(true)}
        printing={printing}
      />

      <AnimatePresence>
        {confirmClose && (
          <ConfirmCloseModal
            onCancel={() => setConfirmClose(false)}
            onConfirm={handleCloseAndPrint}
            total={cart.total()}
            busy={printing}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function CategoryPill({
  cat,
  active,
  onClick
}: {
  cat: Category
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition-all',
        active
          ? 'border-brand-primary bg-brand-primary text-black shadow-glow-amber'
          : 'border-line bg-bg-card text-ink-soft hover:border-line-strong hover:text-ink'
      )}
      style={active && cat.color ? { borderColor: cat.color, background: cat.color, boxShadow: `0 0 24px ${cat.color}33` } : undefined}
    >
      <span className={active ? 'text-black' : ''}>{CAT_ICON[cat.icon ?? ''] ?? <Package size={16} />}</span>
      {cat.nameUzLatn}
    </button>
  )
}

function ProductCard({ product, idx }: { product: Product; idx: number }): JSX.Element {
  const lines = useCart((s) => s.lines)
  const add = useCart((s) => s.add)
  const qty = lines.filter((l) => l.productId === product.id).reduce((s, l) => s + l.quantity, 0)

  return (
    <motion.button
      onClick={() => add(product)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.015 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'group relative flex h-32 flex-col justify-between rounded-2xl border p-4 text-left transition-all',
        qty > 0
          ? 'border-brand-success/50 bg-brand-success/10 shadow-glow'
          : 'border-line bg-bg-card hover:border-line-strong hover:bg-bg-elevated'
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-2xl">{product.emoji ?? '📦'}</span>
        {qty > 0 && (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand-success px-1.5 text-xs font-bold text-black">
            {fmtQty(qty)}
          </span>
        )}
      </div>
      <div>
        <p className="line-clamp-2 text-sm font-semibold leading-tight">{product.nameUzLatn}</p>
        <p className="mt-1 text-sm text-brand-success">{fmtMoney(product.price)} so'm</p>
      </div>
    </motion.button>
  )
}

function CartPanel({
  table,
  onSave,
  onClosePrint,
  printing
}: {
  table: TableEntity
  onSave: () => Promise<void> | void
  onClosePrint: () => void
  printing: boolean
}): JSX.Element {
  const lines = useCart((s) => s.lines)
  const inc = useCart((s) => s.increment)
  const dec = useCart((s) => s.decrement)
  const rem = useCart((s) => s.remove)
  const subtotal = useCart((s) => s.subtotal())
  const fee = useCart((s) => s.serviceFee())
  const total = useCart((s) => s.total())
  const feePct = useCart((s) => s.serviceFeePercent)
  const pending = lines.filter((l) => !l.flushed).length

  return (
    <aside className="flex h-full flex-col border-l border-line bg-bg-soft/40">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-success/15 text-brand-success">
            <ShoppingCart size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold">Savat</p>
            <p className="text-xs text-ink-soft">{table.name}</p>
          </div>
        </div>
        <span className="grid h-7 min-w-7 place-items-center rounded-full bg-brand-success px-2 text-xs font-bold text-black">
          {lines.length}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {lines.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-ink-dim">
            <div>
              <ShoppingCart className="mx-auto mb-2 opacity-30" size={28} />
              Mahsulotlarni tanlang
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {lines.map((l) => (
                <motion.li
                  key={l.localUuid}
                  layout
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className={cn(
                    'rounded-xl border bg-bg-card px-3 py-2.5',
                    l.flushed ? 'border-line' : 'border-brand-warn/30 bg-brand-warn/5'
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.productName}</p>
                      <p className="text-xs text-ink-soft">{fmtMoney(l.unitPrice)} so'm /dona</p>
                    </div>
                    <button
                      onClick={() => rem(l.localUuid)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-ink-dim hover:bg-brand-danger/10 hover:text-brand-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1">
                      <QtyBtn onClick={() => dec(l.localUuid)}>
                        <Minus size={14} />
                      </QtyBtn>
                      <span className="w-8 text-center text-sm font-semibold">{fmtQty(l.quantity)}</span>
                      <QtyBtn onClick={() => inc(l.localUuid)}>
                        <Plus size={14} />
                      </QtyBtn>
                    </div>
                    <p className="text-sm font-semibold text-brand-success">
                      {fmtMoney(Math.round(l.unitPrice * l.quantity))} so'm
                    </p>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <footer className="border-t border-line bg-bg-soft/60 p-4">
        <div className="mb-3 space-y-1.5 text-sm">
          <Row label="Mahsulotlar" value={`${fmtMoney(subtotal)} so'm`} muted />
          {fee > 0 && <Row label={`Xizmat (${feePct}%)`} value={`${fmtMoney(fee)} so'm`} muted />}
          <div className="my-2 h-px bg-line" />
          <Row label="Jami" value={`${fmtMoney(total)} so'm`} large />
          {pending > 0 && (
            <p className="text-right text-[11px] text-brand-warn">{pending} ta mahsulot sinx kutmoqda</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onSave()} className="btn-ghost" disabled={lines.length === 0}>
            <Save size={14} /> Saqlash
          </button>
          <button
            onClick={onClosePrint}
            className="btn-success"
            disabled={lines.length === 0 || printing}
          >
            <Printer size={14} /> Chek & Yopish
          </button>
        </div>
      </footer>
    </aside>
  )
}

function QtyBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-bg-soft text-ink hover:border-line-strong hover:bg-bg-elevated"
    >
      {children}
    </button>
  )
}

function Row({
  label,
  value,
  muted,
  large
}: {
  label: string
  value: string
  muted?: boolean
  large?: boolean
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between">
      <span className={cn(muted && 'text-ink-soft', large && 'text-base font-semibold')}>{label}</span>
      <span className={cn(large ? 'text-xl font-bold text-brand-success' : 'font-medium', muted && !large && 'text-ink-soft')}>
        {value}
      </span>
    </div>
  )
}

function ConfirmCloseModal({
  onCancel,
  onConfirm,
  total,
  busy
}: {
  onCancel: () => void
  onConfirm: () => void | Promise<void>
  total: number
  busy: boolean
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="card-elevated w-full max-w-sm p-6"
      >
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-success/15 text-brand-success">
          <Printer size={22} />
        </div>
        <h3 className="text-lg font-semibold">Buyurtmani yopish</h3>
        <p className="mt-1 text-sm text-ink-soft">Chek chiqariladi va buyurtma yopiladi. Davom etamizmi?</p>
        <div className="my-4 rounded-2xl border border-line bg-bg-card p-3 text-center">
          <p className="text-xs uppercase tracking-wider text-ink-soft">Jami</p>
          <p className="text-2xl font-bold text-brand-success">{fmtMoney(total)} so'm</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-ghost flex-1" disabled={busy}>
            <X size={14} /> Bekor
          </button>
          <button onClick={() => void onConfirm()} className="btn-success flex-1" disabled={busy}>
            <Printer size={14} /> {busy ? 'Chiqarilmoqda…' : 'Tasdiqlash'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
