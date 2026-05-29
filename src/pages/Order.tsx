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
  X,
  Ban
} from 'lucide-react'
import { toast } from 'sonner'
import type { Category, Product, ReceiptPayload, TableEntity } from '@shared/types'
import { useAuth } from '@/stores/auth'
import { useCart, type CartLine } from '@/stores/cart'
import { useMenu } from '@/stores/menu'
import { useSettings } from '@/stores/settings'
import { useTables } from '@/stores/tables'
import { fmtMoney, fmtQty } from '@/lib/format'
import { cn } from '@/lib/cn'

const CAT_ICON: Record<string, JSX.Element> = {
  package: <Package size={18} />,
  leaf: <Leaf size={18} />,
  plus: <Plus size={18} />,
  'cup-soda': <CupSoda size={18} />,
  flame: <Flame size={18} />,
  'chef-hat': <ChefHat size={18} />
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

  const [activeCatId, setActiveCatId] = useState<number | null>(null)
  const [table, setTable] = useState<TableEntity | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!activeCatId && categories[0]) setActiveCatId(categories[0].id)
  }, [categories, activeCatId])

  useEffect(() => {
    void window.afisant.tables.list().then((list) => setTable(list.find((t) => t.id === tId) ?? null))
  }, [tId])

  useEffect(() => {
    if (!table || !waiter) return
    let cancelled = false
    void (async () => {
      const fee = settings?.serviceFeePercent ?? 0
      useCart.setState({ serviceFeePercent: fee })

      const roomServerId = table.serverId

      if (roomServerId) {
        cart.setOrder(0, tId, null, roomServerId)
        const existingOrder = await window.afisant.orders.getByRoom(roomServerId)
        if (cancelled) return

        if (existingOrder) {
          useCart.setState({
            serverOrderId: existingOrder.serverId ?? null,
            roomServerId
          })
          cart.hydrateFromOrder(
            existingOrder.items.map<CartLine>((it) => {
              const product = products.find((p) => p.id === it.productId || p.serverId === it.serverId)
              return {
                localUuid: it.localUuid,
                productId: it.productId,
                productServerId: product?.serverId ?? null,
                productName: it.productName,
                unitPrice: it.unitPrice,
                quantity: it.quantity,
                notes: it.notes,
                flushed: true,
                itemId: it.id,
                addedAt: it.createdAt
              }
            })
          )
        }
      } else {
        const fee2 = settings?.serviceFeePercent ?? 0
        useCart.setState({ serviceFeePercent: fee2 })
        const order = await window.afisant.orders.upsert({
          tableId: tId,
          waiterId: waiter.id,
          serviceFeePercent: fee2
        })
        if (cancelled) return
        cart.setOrder(order.id, tId)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tId, table, waiter?.id, settings?.serviceFeePercent])

  const shownProducts = useMemo<Product[]>(
    () => products.filter((p) => p.categoryId === activeCatId),
    [products, activeCatId]
  )

  const handleSave = async (): Promise<void> => {
    if (cart.lines.length === 0) {
      navigate('/tables')
      return
    }
    setSaving(true)
    try {
      const roomServerId = useCart.getState().roomServerId
      const waiterServerId = waiter.serverId

      if (roomServerId && waiterServerId) {
        const itemsWithServerId = cart.lines.filter((l) => l.productServerId && l.quantity > 0)
        if (itemsWithServerId.length > 0) {
          const res = await window.afisant.orders.syncAll({
            roomServerId,
            waiterServerId,
            items: itemsWithServerId.map((l) => ({
              productServerId: l.productServerId!,
              count: Math.round(l.quantity)
            }))
          })
          useCart.setState({ serverOrderId: res.serverId })
          useCart.setState({
            lines: cart.lines.map((l) => ({ ...l, flushed: true }))
          })
        }
      }

      await refreshTable(tId)
      toast.success('Buyurtma saqlandi')
      cart.clear()
      cart.setOrder(null, null)
      navigate('/tables')
    } catch (e: any) {
      toast.error('Saqlashda xatolik', { description: e?.message })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (): Promise<void> => {
    setSaving(true)
    try {
      const serverOrderId = useCart.getState().serverOrderId
      const orderId = cart.orderId
      if (orderId || serverOrderId) {
        await window.afisant.orders.cancel(orderId ?? 0, serverOrderId ?? undefined)
      }
      cart.clear()
      cart.setOrder(null, null)
      await refreshTable(tId)
      toast.success("Buyurtma bekor qilindi")
      navigate('/tables')
    } catch (e: any) {
      toast.error('Bekor qilishda xatolik', { description: e?.message })
    } finally {
      setSaving(false)
      setConfirmCancel(false)
    }
  }

  const handleCloseAndPrint = async (): Promise<void> => {
    if (!table || !waiter) return
    if (cart.lines.length === 0 && !cart.serverOrderId) {
      toast.error("Savat bo'sh")
      return
    }
    setPrinting(true)
    try {
      const roomServerId = useCart.getState().roomServerId
      const waiterServerId = waiter.serverId
      let serverOrderId = useCart.getState().serverOrderId

      if (roomServerId && waiterServerId && cart.lines.length > 0) {
        const itemsWithServerId = cart.lines.filter((l) => l.productServerId && l.quantity > 0)
        if (itemsWithServerId.length > 0) {
          const res = await window.afisant.orders.syncAll({
            roomServerId,
            waiterServerId,
            items: itemsWithServerId.map((l) => ({
              productServerId: l.productServerId!,
              count: Math.round(l.quantity)
            }))
          })
          serverOrderId = res.serverId
        }
      }

      const payload: ReceiptPayload = {
        organizationName: settings?.organizationName ?? 'Restoran',
        tableName: table.name,
        waiterName: `${waiter.firstName} ${waiter.lastName}`,
        orderLocalUuid: serverOrderId ?? String(cart.orderId ?? 'unkwn'),
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
      if (!res.ok) {
        if (settings?.printerType) {
          toast.error("Chek chiqarib bo'lmadi", { description: (res as any).error })
        } else {
          toast.message("Printer ulanmagan — chek o'tkazib yuborildi")
        }
      } else {
        toast.success('Chek chiqdi')
      }

      if (serverOrderId) {
        await window.afisant.orders.close(cart.orderId ?? 0, serverOrderId)
      } else if (cart.orderId) {
        await window.afisant.orders.close(cart.orderId)
      }

      cart.clear()
      cart.setOrder(null, null)
      await refreshTable(tId)
      navigate('/tables')
    } catch (e: any) {
      toast.error('Xatolik', { description: e?.message })
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
    <div className="grid h-full" style={{ gridTemplateColumns: '1fr 320px' }}>
      <section className="flex flex-col overflow-hidden bg-bg">
        <header className="flex items-center justify-between border-b border-line bg-bg-card px-4 py-3 shadow-sm">
          <button
            onClick={() => void handleSave()}
            className="btn-ghost"
            disabled={saving || printing}
          >
            <ArrowLeft size={15} /> Orqaga
          </button>
          <div className="text-center">
            <p className="text-[10px] font-medium uppercase tracking-widest text-ink-dim">STOL</p>
            <p className="text-lg font-bold text-ink">{table.name}</p>
          </div>
          <div className="w-[80px]" />
        </header>

        <nav className="flex gap-1.5 overflow-x-auto border-b border-line bg-bg-card px-4 py-2">
          {categories.map((c) => (
            <CategoryPill
              key={c.id}
              cat={c}
              active={c.id === activeCatId}
              onClick={() => setActiveCatId(c.id)}
            />
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto bg-bg px-4 py-4">
          {shownProducts.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-ink-dim">
              Bu kategoriyada mahsulot yo'q
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))' }}>
              {shownProducts.map((p, idx) => (
                <ProductCard key={p.id} product={p} idx={idx} />
              ))}
            </div>
          )}
        </div>
      </section>

      <CartPanel
        table={table}
        onSave={handleSave}
        onClosePrint={() => setConfirmClose(true)}
        onCancel={() => setConfirmCancel(true)}
        printing={printing}
        saving={saving}
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
        {confirmCancel && (
          <ConfirmCancelModal
            onCancel={() => setConfirmCancel(false)}
            onConfirm={handleCancel}
            busy={saving}
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
        'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all',
        active
          ? 'border-brand-primary bg-brand-primary text-white shadow-sm shadow-brand-primary/20'
          : 'border-line bg-white text-ink-soft hover:border-line-strong hover:text-ink'
      )}
      style={
        active && cat.color
          ? { borderColor: cat.color, background: cat.color }
          : undefined
      }
    >
      <span className={active ? 'text-white/80' : 'text-ink-dim'}>
        {CAT_ICON[cat.icon ?? ''] ?? <Package size={16} />}
      </span>
      {cat.nameUzLatn}
    </button>
  )
}

function ProductCard({ product, idx }: { product: Product; idx: number }): JSX.Element {
  const lines = useCart((s) => s.lines)
  const add = useCart((s) => s.add)
  const qty = lines.filter((l) => l.productId === product.id).reduce((s, l) => s + l.quantity, 0)

  return (
    <motion.div
      onClick={() => add(product)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.015 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border transition-all select-none',
        qty > 0
          ? 'border-brand-success/50 bg-white shadow-glow'
          : 'border-line bg-white shadow-card hover:shadow-card-hover hover:border-line-strong'
      )}
    >
      {/* Miqdor badge */}
      {qty > 0 && (
        <div className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-brand-success text-xs font-bold text-white shadow-md ring-2 ring-white">
          {qty}
        </div>
      )}

      {/* Rasm qismi */}
      {product.photo ? (
        <div className="relative h-28 w-full overflow-hidden bg-slate-50">
          <img
            src={`${import.meta.env.VITE_API_URL}/image/${product.photo}`}
            alt={product.nameUzLatn}
            className="h-full w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          {qty > 0 && <div className="absolute inset-x-0 bottom-0 h-1 bg-brand-success" />}
        </div>
      ) : (
        <div className={cn('flex h-20 items-center justify-center text-4xl', qty > 0 ? 'bg-brand-success/5' : 'bg-slate-50')}>
          {product.emoji ?? '📦'}
        </div>
      )}

      {/* Matn qismi */}
      <div className="flex flex-col gap-0.5 p-2.5">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-ink">
          {product.nameUzLatn}
        </p>
        <p className="text-xs font-bold text-brand-success">
          {fmtMoney(product.price)} so'm
        </p>
      </div>
    </motion.div>
  )
}

function CartPanel({
  table,
  onSave,
  onClosePrint,
  onCancel,
  printing,
  saving
}: {
  table: TableEntity
  onSave: () => Promise<void> | void
  onClosePrint: () => void
  onCancel: () => void
  printing: boolean
  saving: boolean
}): JSX.Element {
  const lines = useCart((s) => s.lines)
  const inc = useCart((s) => s.increment)
  const dec = useCart((s) => s.decrement)
  const rem = useCart((s) => s.remove)
  const subtotal = useCart((s) => s.subtotal())
  const fee = useCart((s) => s.serviceFee())
  const total = useCart((s) => s.total())
  const feePct = useCart((s) => s.serviceFeePercent)

  return (
    <aside className="flex h-full flex-col border-l border-line bg-bg-soft">
      <header className="flex items-center justify-between border-b border-line bg-bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <ShoppingCart size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Savat</p>
            <p className="text-xs text-ink-soft">{table.name}</p>
          </div>
        </div>
        <span className="grid h-7 min-w-7 place-items-center rounded-full bg-brand-primary px-2 text-xs font-bold text-white">
          {lines.length}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {lines.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-ink-dim">
            <div>
              <ShoppingCart className="mx-auto mb-2 opacity-25" size={32} />
              Mahsulotlarni tanlang
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {lines.map((l) => (
                <motion.li
                  key={l.localUuid}
                  layout
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="rounded-lg border border-line bg-white px-2.5 py-2 shadow-sm"
                >
                  {/* Nom + o'chirish */}
                  <div className="flex items-center gap-1 mb-1.5">
                    <p className="truncate text-xs font-semibold flex-1 text-ink">{l.productName}</p>
                    <button onClick={() => rem(l.localUuid)} className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-dim hover:text-brand-danger">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {/* Miqdor + narx bir qatorda */}
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1">
                      <QtyBtn onClick={() => dec(l.localUuid)}><Minus size={12} /></QtyBtn>
                      <span className="w-6 text-center text-xs font-bold">{fmtQty(l.quantity)}</span>
                      <QtyBtn onClick={() => inc(l.localUuid)}><Plus size={12} /></QtyBtn>
                    </div>
                    <p className="text-xs font-bold text-brand-success">
                      {fmtMoney(Math.round(l.unitPrice * l.quantity))} so'm
                    </p>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <footer className="border-t border-line bg-bg-card p-3">
        <div className="mb-4 space-y-1.5 text-sm">
          <Row label="Mahsulotlar" value={`${fmtMoney(subtotal)} so'm`} muted />
          {fee > 0 && <Row label={`Xizmat (${feePct}%)`} value={`${fmtMoney(fee)} so'm`} muted />}
          <div className="my-2 h-px bg-line" />
          <Row label="Jami" value={`${fmtMoney(total)} so'm`} large />
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onCancel}
            className="btn-danger w-full"
            disabled={saving || printing || lines.length === 0}
          >
            <Ban size={14} /> Zakazni bekor qilish
          </button>
          <button
            onClick={() => void onSave()}
            className="btn-primary w-full"
            disabled={saving || printing}
          >
            <Save size={14} /> {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
          <button
            onClick={onClosePrint}
            className="btn-success w-full"
            disabled={lines.length === 0 || printing || saving}
          >
            <Printer size={14} /> {printing ? 'Chiqarilmoqda…' : 'Chek & Yopish'}
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
      className="grid h-6 w-6 place-items-center rounded border border-line bg-bg-soft text-ink hover:border-line-strong hover:bg-bg-elevated"
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
      <span className={cn(large ? 'text-xl font-bold text-ink' : 'font-medium', muted && !large && 'text-ink-soft')}>
        {value}
      </span>
    </div>
  )
}

function ConfirmCancelModal({
  onCancel,
  onConfirm,
  busy
}: {
  onCancel: () => void
  onConfirm: () => void | Promise<void>
  busy: boolean
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-sm p-6"
      >
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-danger/10 text-brand-danger">
          <Ban size={22} />
        </div>
        <h3 className="text-lg font-semibold text-ink">Zakazni bekor qilish</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Barcha mahsulotlar o'chirilib, buyurtma bekor qilinadi. Davom etasizmi?
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="btn-ghost flex-1" disabled={busy}>
            <X size={14} /> Orqaga
          </button>
          <button
            onClick={() => void onConfirm()}
            className="btn-danger flex-1"
            disabled={busy}
          >
            <Ban size={14} /> {busy ? 'Bekor qilinmoqda…' : 'Ha, bekor qilish'}
          </button>
        </div>
      </motion.div>
    </motion.div>
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
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-primary/10 text-brand-primary">
          <Printer size={22} />
        </div>
        <h3 className="text-lg font-semibold text-ink">Buyurtmani yopish</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Chek chiqariladi va buyurtma yopiladi. Davom etamizmi?
        </p>
        <div className="my-4 rounded-2xl border border-line bg-bg p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-dim">Jami to'lov</p>
          <p className="mt-1 text-3xl font-bold text-ink">{fmtMoney(total)} so'm</p>
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
