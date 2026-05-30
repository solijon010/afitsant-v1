import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ChefHat,
  CupSoda,
  Delete,
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
import { useCachedImage } from '@/hooks/useCachedImage'
import { useMenu } from '@/stores/menu'
import { useSettings } from '@/stores/settings'
import { useTables } from '@/stores/tables'
import { useOrderHistory, type HistoryEntry } from '@/stores/orderHistory'
import { fmtMoney, fmtQty, fmtDate } from '@/lib/format'
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
  // Server dan yuklangan dastlabki items — saqlashda o'chirilganlarni aniqlash uchun
  const initialServerItemsRef = useRef<CartLine[]>([])

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
        // Avval serverda aktiv buyurtma bormi tekshiramiz
        const existingOrder = await window.afisant.orders.getByRoom(roomServerId)
        if (cancelled) return
        if (existingOrder) {
          // Local SQLite ni ham tekshiramiz — agar saqlab qo'yilgan bo'lsa uni oldinlikka qo'yamiz
          const localOrder = await window.afisant.tables.getByTable(tId)
          if (cancelled) return

          if (localOrder && localOrder.items.length > 0) {
            // Foydalanuvchi bu qurilmada saqlagan — local versiyani ishlatamiz
            // Server order ID ni saqlab qolamiz, future sync uchun
            cart.setOrder(localOrder.id, tId, existingOrder.serverId ?? null, roomServerId)
            cart.hydrateFromOrder(
              localOrder.items.map<CartLine>((it) => {
                // productServerId ni products store'dan qidiramiz — server sync uchun zarur
                const prod = products.find((p) => p.id === it.productId)
                return {
                  localUuid: it.localUuid,
                  productId: it.productId,
                  productServerId: prod?.serverId ?? null,
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
            return
          }

          // Local yoq — server buyurtmasini yuklaymiz
          const serverLines = existingOrder.items.map<CartLine>((it) => {
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
          // Dastlabki server items ni eslab qolamiz — saqlashda o'chirilganlarni topish uchun
          initialServerItemsRef.current = serverLines

          const baseOrder = await window.afisant.orders.upsert({
            tableId: tId,
            waiterId: waiter.id,
            serviceFeePercent: fee
          })
          if (cancelled) return
          cart.setOrder(baseOrder.id, tId, existingOrder.serverId ?? null, roomServerId)
          cart.hydrateFromOrder(serverLines)
          return
        }
      }

      // Server buyurtmasi yo'q — local SQLite dan tekshiramiz
      const localOrder = await window.afisant.tables.getByTable(tId)
      if (cancelled) return
      if (localOrder && localOrder.items.length > 0) {
        // Mahsulotlari bor local buyurtma — yuklaymiz (yangi buyurtma yaratmaymiz)
        cart.setOrder(localOrder.id, tId, null, roomServerId ?? null)
        cart.hydrateFromOrder(
          localOrder.items.map<CartLine>((it) => {
            // productServerId ni products store'dan qidiramiz — server sync uchun zarur
            const prod = products.find((p) => p.id === it.productId)
            return {
              localUuid: it.localUuid,
              productId: it.productId,
              productServerId: prod?.serverId ?? null,
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
      } else {
        // Hech qanday buyurtma yo'q — lazy rejim: mahsulot qo'shilganda yaratiladi
        useCart.setState({
          orderId: null,
          tableId: tId,
          serverOrderId: null,
          roomServerId: roomServerId ?? null,
          lines: []
        })
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
      const fee = settings?.serviceFeePercent ?? 0

      // Lazy order creation — mahsulot qo'shilganda birinchi marta SQLite buyurtma yaratiladi
      let orderId = cart.orderId
      if (!orderId) {
        const baseOrder = await window.afisant.orders.upsert({
          tableId: tId,
          waiterId: waiter.id,
          serviceFeePercent: fee
        })
        orderId = baseOrder.id
        useCart.setState({ orderId: baseOrder.id })
      }

      // Har doim local SQLite ga saqlash (offline persistence uchun)
      await window.afisant.orders.replaceItems(
        orderId,
        cart.lines.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          notes: l.notes ?? null,
          localUuid: l.localUuid
        }))
      )

      // Server sync — roomServerId bo'lsa yuboramiz (waiterServerId shart emas — JWT tokendan olinadi)
      if (!roomServerId) {
        // Xona server_id yo'q — sinxronlash kerak
        toast.error("Xona server ID yo'q — Sozlamalar → To'liq sinxronlash bosing")
      } else {
        const itemsWithServerId = cart.lines.filter((l) => l.productServerId && l.quantity > 0)
        // Server dan yuklangan va endi savatchada yo'q mahsulotlar — count:0 bilan yuboriladi
        const removedFromServer = initialServerItemsRef.current.filter(
          (init) => init.productServerId &&
            !cart.lines.some((l) => l.productServerId === init.productServerId)
        )
        const syncItems = [
          ...itemsWithServerId.map((l) => ({
            productServerId: l.productServerId!,
            count: Math.round(l.quantity)
          })),
          ...removedFromServer.map((item) => ({
            productServerId: item.productServerId!,
            count: 0
          }))
        ]
        if (syncItems.length > 0) {
          try {
            const res = await window.afisant.orders.syncAll({
              roomServerId,
              items: syncItems
            })
            useCart.setState({ serverOrderId: res.serverId })
            useCart.setState({
              lines: cart.lines.map((l) => ({ ...l, flushed: true }))
            })
            initialServerItemsRef.current = cart.lines.filter((l) => l.productServerId)
            toast.success('Buyurtma serverga yuborildi ✓')
          } catch (e: any) {
            const msg = e?.message ?? ''
            if (msg.includes('404') || msg.includes('mavjud emas') || msg.includes('inactive')) {
              toast.warning('Ba\'zi mahsulotlar serverda yo\'q — mahalliy saqlandi')
            } else {
              toast.warning(`Server bilan ulanib bo'lmadi — mahalliy saqlandi`)
            }
            console.warn('[ORDER] syncAll xato (mahalliy saqlandi):', msg)
          }
        } else if (cart.lines.length > 0) {
          // Mahsulotlarda server_id yo'q — fullPull kerak
          toast.error("Mahsulotlarda server ID yo'q — Sozlamalar → To'liq sinxronlash bosing")
        }
      }

      // Localda saqlash (vaqt bilan)
      if (table) {
        useOrderHistory.getState().push({
          tableId: tId,
          tableName: table.name,
          waiterName: `${waiter.firstName} ${waiter.lastName}`,
          savedAt: Date.now(),
          items: cart.lines.map((l) => ({
            name: l.productName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            total: Math.round(l.unitPrice * l.quantity)
          })),
          subtotal: cart.subtotal(),
          serviceFee: cart.serviceFee(),
          total: cart.total()
        })
      }

      await refreshTable(tId)
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
      let serverOrderId = useCart.getState().serverOrderId
      const fee = settings?.serviceFeePercent ?? 0

      // Lazy order creation — mahsulot bor bo'lsa SQLite buyurtma yaratamiz
      let orderId = cart.orderId
      if (!orderId && cart.lines.length > 0) {
        const baseOrder = await window.afisant.orders.upsert({
          tableId: tId,
          waiterId: waiter.id,
          serviceFeePercent: fee
        })
        orderId = baseOrder.id
        useCart.setState({ orderId: baseOrder.id })
      }

      if (roomServerId && cart.lines.length > 0) {
        const itemsWithServerId = cart.lines.filter((l) => l.productServerId && l.quantity > 0)
        if (itemsWithServerId.length > 0) {
          try {
            const res = await window.afisant.orders.syncAll({
              roomServerId,
              items: itemsWithServerId.map((l) => ({
                productServerId: l.productServerId!,
                count: Math.round(l.quantity)
              }))
            })
            serverOrderId = res.serverId
            console.log('[ORDER] Close sync OK, serverId:', serverOrderId)
          } catch (e: any) {
            toast.warning(`Server sync xatosi: ${e?.message ?? 'ulanish yo\'q'}`)
          }
        } else {
          toast.warning("Mahsulotlarda server ID yo'q — Sozlamalar → To'liq sinxronlash")
        }
      }

      const payload: ReceiptPayload = {
        organizationName: settings?.organizationName ?? 'Restoran',
        tableName: table.name,
        waiterName: `${waiter.firstName} ${waiter.lastName}`,
        orderLocalUuid: serverOrderId ?? String(orderId ?? 'unkwn'),
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

      // Localda saqlash va chop etilgan deb belgilash
      const histId = useOrderHistory.getState().push({
        tableId: tId,
        tableName: table.name,
        waiterName: `${waiter.firstName} ${waiter.lastName}`,
        savedAt: Date.now(),
        items: payload.items,
        subtotal: payload.subtotal,
        serviceFee: payload.serviceFee,
        total: payload.total
      })
      useOrderHistory.getState().markPrinted(histId)

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
        await window.afisant.orders.close(orderId ?? 0, serverOrderId)
      } else if (orderId) {
        await window.afisant.orders.close(orderId)
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
    <div className="grid h-full" style={{ gridTemplateColumns: '1fr 420px' }}>
      <section className="flex flex-col overflow-hidden" style={{ background: '#2f54a6' }}>
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone-100 bg-white px-4 shadow-sm">
          <button
            onClick={() => void handleSave()}
            className="btn-ghost"
            disabled={saving || printing}
          >
            <ArrowLeft size={15} /> Orqaga
          </button>
          <div className="text-center">
            <p className="text-base font-bold text-stone-800">{table.name}</p>
          </div>
          <div className="w-[80px]" />
        </header>

        <nav className="flex gap-2 overflow-x-auto border-b border-stone-100 bg-white px-5 py-3 shrink-0">
          {categories.map((c) => (
            <CategoryPill
              key={c.id}
              cat={c}
              active={c.id === activeCatId}
              onClick={() => setActiveCatId(c.id)}
            />
          ))}
        </nav>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
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
        tableId={tId}
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
        'inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all',
        active
          ? 'border-[#C2410C] bg-[#C2410C] text-white shadow-sm'
          : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700'
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
  const [showKgModal, setShowKgModal] = useState(false)
  const imgSrc = useCachedImage(product.photo)

  const handleClick = (): void => {
    if (product.unit === 'kg') setShowKgModal(true)
    else add(product)
  }

  const qtyLabel = qty > 0
    ? (product.unit === 'kg' ? `${qty} kg` : `${qty} ta`)
    : null

  return (
    <>
      <motion.div
        onClick={handleClick}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.015 }}
        whileTap={{ scale: 0.97 }}
        className={cn(
          'relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 transition-all select-none',
          qty > 0
            ? 'border-[#1EA4E9] bg-white shadow-glow-primary'
            : 'border-stone-200 bg-white shadow-card hover:shadow-card-hover hover:border-stone-400'
        )}
      >
        {/* Miqdor badge */}
        {qtyLabel && (
          <div style={{
            position: 'absolute', top: 7, right: 7, zIndex: 2,
            background: '#C2410C', color: 'white',
            borderRadius: 20, padding: '2px 8px',
            fontSize: 11, fontWeight: 800,
            boxShadow: '0 2px 8px rgba(194,65,12,0.4)',
            lineHeight: 1.5
          }}>
            {qtyLabel}
          </div>
        )}

        {imgSrc ? (
          <div className="relative aspect-square w-full overflow-hidden bg-white">
            <img
              src={imgSrc}
              alt={product.nameUzLatn}
              className="h-full w-full object-contain p-2"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            {qty > 0 && <div className="absolute inset-x-0 bottom-0 h-1 bg-[#C2410C]" />}
          </div>
        ) : (
          <div className={cn('flex aspect-square items-center justify-center text-5xl', qty > 0 ? 'bg-[#C2410C]/5' : 'bg-stone-50')}>
            {product.emoji ?? '📦'}
          </div>
        )}
        <div className="flex flex-col gap-2 p-3">
          <p className="line-clamp-2 font-semibold leading-snug" style={{ fontSize: 14, color: '#1C1917' }}>{product.nameUzLatn}</p>
          <p className="font-mono font-bold" style={{ fontSize: 14, color: '#1C1917' }}>
            {fmtMoney(product.price)} so'm{product.unit === 'kg' ? ' / kg' : ''}
          </p>
        </div>
      </motion.div>

      <AnimatePresence>
        {showKgModal && (
          <KgModal
            product={product}
            onClose={() => setShowKgModal(false)}
            onAdd={(weight) => { add(product, weight); setShowKgModal(false) }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// Raqamli klaviatura — sistem klaviatura chiqmaydi
const NUMPAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'] as const

function KgModal({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (weight: number) => void }): JSX.Element {
  // mode: 'kg' — KG yozyapmiz, 'som' — so'm yozyapmiz
  const [mode, setMode] = useState<'kg' | 'som'>('kg')
  const [kgVal, setKgVal] = useState('')
  const [somVal, setSomVal] = useState('')

  const parsedKg = parseFloat(kgVal) || 0
  const parsedSom = parseFloat(somVal) || 0

  // Ko'rsatish uchun hisoblangan qiymatlar
  const displayKg = kgVal || '0'
  const displaySom = mode === 'som'
    ? (somVal || '0')
    : (parsedKg > 0 ? String(Math.round(product.price * parsedKg)) : '0')

  const canAdd = (mode === 'kg' ? parsedKg : parsedSom) > 0
  const finalKg = mode === 'kg' ? parsedKg : (parsedSom > 0 ? parsedSom / product.price : 0)

  const handleKey = (key: string): void => {
    if (mode === 'kg') {
      setKgVal(prev => {
        if (key === '⌫') return prev.slice(0, -1)
        if (key === '.' && prev.includes('.')) return prev
        if (key === '.' && prev === '') return '0.'
        if (prev === '0' && key !== '.') return key
        return prev + key
      })
    } else {
      setSomVal(prev => {
        if (key === '⌫') return prev.slice(0, -1)
        if (key === '.') return prev // so'mda nuqta kerak emas
        if (prev === '0' && key !== '.') return key
        return prev + key
      })
    }
  }

  const switchMode = (m: 'kg' | 'som'): void => {
    setMode(m)
    // Boshqa maydonni hisoblangan qiymat bilan to'ldiramiz
    if (m === 'som' && parsedKg > 0) {
      setSomVal(String(Math.round(product.price * parsedKg)))
    } else if (m === 'kg' && parsedSom > 0) {
      const computed = parsedSom / product.price
      setKgVal(computed.toFixed(3).replace(/\.?0+$/, ''))
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }} transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 300, borderRadius: 20, background: 'white', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{product.nameUzLatn}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#22c55e', fontWeight: 600 }}>{fmtMoney(product.price)} so'm / kg</p>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', color: '#64748b' }}>
            <X size={14} />
          </button>
        </div>

        {/* KG / So'm display — bosib almashish */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #f1f5f9' }}>
          {/* KG tomoni */}
          <button onClick={() => switchMode('kg')} style={{
            flex: 1, padding: '12px 14px', textAlign: 'left', border: 'none', cursor: 'pointer',
            background: mode === 'kg' ? '#f0fdf4' : 'white',
            borderRight: '1px solid #f1f5f9',
            borderBottom: mode === 'kg' ? '2px solid #22c55e' : '2px solid transparent',
            transition: 'all 0.15s'
          }}>
            <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>KG</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: mode === 'kg' ? '#15803d' : '#94a3b8', fontFamily: 'monospace' }}>
              {mode === 'kg' ? (kgVal || '0') : (parsedSom > 0 ? (parsedSom / product.price).toFixed(3).replace(/\.?0+$/, '') : displayKg)}
            </p>
          </button>

          {/* So'm tomoni */}
          <button onClick={() => switchMode('som')} style={{
            flex: 1, padding: '12px 14px', textAlign: 'left', border: 'none', cursor: 'pointer',
            background: mode === 'som' ? '#eff6ff' : 'white',
            borderBottom: mode === 'som' ? '2px solid #3b82f6' : '2px solid transparent',
            transition: 'all 0.15s'
          }}>
            <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>SO'M</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: mode === 'som' ? '#1d4ed8' : '#94a3b8', fontFamily: 'monospace' }}>
              {mode === 'som' ? (somVal || '0') : displaySom}
            </p>
          </button>
        </div>

        {/* Raqamli klaviatura */}
        <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
          {NUMPAD_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => handleKey(key)}
              style={{
                height: 52, borderRadius: 12, border: 'none', cursor: 'pointer',
                fontSize: key === '⌫' ? 18 : 20,
                fontWeight: key === '⌫' ? 400 : 700,
                background: key === '⌫' ? '#fee2e2' : '#f8fafc',
                color: key === '⌫' ? '#ef4444' : '#1e293b',
                display: 'grid', placeItems: 'center',
                transition: 'background 0.1s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
              }}
              onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.background = key === '⌫' ? '#fecaca' : '#e2e8f0' }}
              onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.background = key === '⌫' ? '#fee2e2' : '#f8fafc' }}
            >
              {key}
            </button>
          ))}
        </div>

        {/* Tugmalar */}
        <div style={{ padding: '0 12px 14px', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, height: 46, borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Bekor
          </button>
          <button
            onClick={() => { if (canAdd && finalKg > 0) onAdd(finalKg) }}
            disabled={!canAdd || finalKg <= 0}
            style={{
              flex: 1.6, height: 46, borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700, cursor: canAdd ? 'pointer' : 'not-allowed',
              background: canAdd ? 'linear-gradient(145deg,#22c55e,#16a34a)' : '#e2e8f0',
              color: canAdd ? 'white' : '#94a3b8',
              boxShadow: canAdd ? '0 4px 12px rgba(34,197,94,0.35)' : 'none'
            }}
          >
            + Qo'shish {canAdd ? `(${finalKg.toFixed(2).replace(/\.?0+$/, '')} kg)` : ''}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function CartPanel({
  table,
  tableId,
  onSave,
  onClosePrint,
  onCancel,
  printing,
  saving
}: {
  table: TableEntity
  tableId: number
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
  const roomServerId = useCart((s) => s.roomServerId)
  const [showHistory, setShowHistory] = useState(false)
  const prevLinesLen = useRef(lines.length)

  // Mahsulotlardan hech biri server_id ga ega emas — fullPull kerak
  const noProductServerIds = lines.length > 0 && lines.every((l) => !l.productServerId)
  const syncWarning = !roomServerId || noProductServerIds

  const allEntries = useOrderHistory((s) => s.entries)
  const historyEntries = allEntries
    .filter((e) => e.tableId === tableId)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 30)

  /* Savatga mahsulot qo'shilsa tarixni yopamiz */
  useEffect(() => {
    if (lines.length > prevLinesLen.current && showHistory) setShowHistory(false)
    prevLinesLen.current = lines.length
  }, [lines.length, showHistory])

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', borderLeft: '1px solid #E7E5E4', background: '#f2ff00' }}>

      {/* Sinxronlash ogorish banneri */}
      {syncWarning && lines.length > 0 && (
        <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FDE68A', padding: '8px 14px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: 11, color: '#92400E', fontWeight: 600, lineHeight: 1.45 }}>
            {!roomServerId
              ? "Xona server bilan bog'lanmagan. Sozlamalar → To'liq sinxronlash bosing."
              : "Mahsulotlar server bilan bog'lanmagan. Sozlamalar → To'liq sinxronlash bosing."}
          </p>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '14px 16px', background: 'white', borderBottom: '1px solid #E7E5E4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: '#C2410C', display: 'grid', placeItems: 'center', boxShadow: '0 4px 12px rgba(194,65,12,0.25)' }}>
            <ShoppingCart size={16} color="white" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Savat</p>
            <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{table.name}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {historyEntries.length > 0 && (
            <button
              onClick={() => setShowHistory((v) => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: showHistory ? '#fff7ed' : '#f1f5f9',
                border: `1px solid ${showHistory ? '#C2410C' : '#e2e8f0'}`,
                color: showHistory ? '#C2410C' : '#64748b',
                borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer'
              }}
            >
              <Printer size={11} />
              Tarix ({historyEntries.length})
            </button>
          )}
          <div style={{ minWidth: 28, height: 28, borderRadius: 99, background: lines.length > 0 ? '#C2410C' : '#E7E5E4', display: 'grid', placeItems: 'center', padding: '0 8px' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: lines.length > 0 ? 'white' : '#A8A29E' }}>{lines.length}</span>
          </div>
        </div>
      </div>

      {/* Asosiy kontent — savat yoki tarix (almashinadi, footer doim ko'rinadi) */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 10px' }}>
        <AnimatePresence mode="wait">
          {showHistory ? (
            /* ── Tarix paneli ── */
            <motion.div key="history"
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              <p style={{ margin: '4px 0 10px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {table.name} — Zakazlar tarixi
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {historyEntries.map((entry) => (
                  <HistoryEntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </motion.div>
          ) : (
            /* ── Savat ── */
            <motion.div key="cart"
              initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.18 }}
              style={{ height: lines.length === 0 ? '100%' : undefined }}
            >
              {lines.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#A8A29E', gap: 8 }}>
                  <ShoppingCart size={32} style={{ opacity: 0.25 }} />
                  <span style={{ fontSize: 13 }}>Mahsulotlarni tanlang</span>
                </div>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lines.map((l, idx) => (
                    <li key={l.localUuid}
                      style={{ background: 'white', borderRadius: 10, padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #E7E5E4' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1C1917', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {idx + 1}. {l.productName}
                        </p>
                        <button onClick={() => rem(l.localUuid)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FCA5A5', padding: '2px 4px', borderRadius: 6, display: 'grid', placeItems: 'center', flexShrink: 0 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#FCA5A5' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F5F5F4', borderRadius: 8, padding: '2px 4px', border: '1px solid #E7E5E4' }}>
                          <QtyBtn onClick={() => dec(l.localUuid)}><Minus size={10} /></QtyBtn>
                          <span style={{ minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: 800, color: '#1C1917' }}>{fmtQty(l.quantity)}</span>
                          <QtyBtn onClick={() => inc(l.localUuid)}><Plus size={10} /></QtyBtn>
                        </div>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#C2410C', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmtMoney(Math.round(l.unitPrice * l.quantity))} so'm
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div style={{ background: 'white', borderTop: '1px solid #E7E5E4', padding: '12px 14px', flexShrink: 0 }}>
        {/* Jami */}
        <div style={{ background: '#F5F5F4', borderRadius: 12, padding: '10px 14px', marginBottom: 10, border: '1px solid #E7E5E4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#78716C' }}>Mahsulotlar</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#57534E' }}>{fmtMoney(subtotal)} so'm</span>
          </div>
          {fee > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#78716C' }}>Xizmat ({feePct}%)</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#57534E' }}>{fmtMoney(fee)} so'm</span>
            </div>
          )}
          <div style={{ height: 1, background: '#E7E5E4', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1917' }}>Jami</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#C2410C', fontFamily: 'JetBrains Mono, monospace' }}>{fmtMoney(total)} so'm</span>
          </div>
        </div>

        {/* Tugmalar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <button onClick={onCancel} disabled={saving || printing || lines.length === 0}
            style={{ width: '100%', height: 40, borderRadius: 10, border: '1.5px solid #fca5a5', background: lines.length === 0 ? '#f8fafc' : '#fff1f2', color: lines.length === 0 ? '#94a3b8' : '#ef4444', fontSize: 12, fontWeight: 700, cursor: lines.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Ban size={13} /> Zakazni bekor qilish
          </button>
          <div style={{ display: 'flex', gap: 7 }}>
            <button onClick={() => void onSave()} disabled={saving || printing}
              style={{ flex: 1, height: 42, borderRadius: 10, border: '1.5px solid #D6D3D1', background: 'white', color: '#1C1917', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving || printing ? 0.6 : 1 }}>
              <Save size={13} /> {saving ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
            <button onClick={onClosePrint} disabled={lines.length === 0 || printing || saving}
              style={{ flex: 1, height: 42, borderRadius: 10, border: 'none', background: lines.length === 0 ? '#e2e8f0' : 'linear-gradient(145deg,#22c55e,#15803d)', color: lines.length === 0 ? '#94a3b8' : 'white', fontSize: 13, fontWeight: 700, cursor: lines.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: lines.length > 0 ? '0 4px 12px rgba(34,197,94,0.35)' : 'none', opacity: printing || saving ? 0.6 : 1 }}>
              <Printer size={13} /> {printing ? 'Chiqarilmoqda…' : 'Chek & Yopish'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

function HistoryEntryRow({ entry }: { entry: HistoryEntry }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <li className="overflow-hidden rounded-xl border border-line bg-bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{fmtDate(entry.savedAt)}</p>
          <p className="text-xs text-ink-soft">
            {entry.waiterName} · {entry.items.length} ta mahsulot
            {entry.printCount > 0 && (
              <span className="ml-1 text-brand-success">· {entry.printCount} chek</span>
            )}
          </p>
        </div>
        <p className="shrink-0 text-sm font-bold text-brand-success">{fmtMoney(entry.total)} so'm</p>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t border-line"
          >
            <ul className="space-y-1 px-3 py-2">
              {entry.items.map((item, i) => (
                <li key={i} className="flex items-baseline justify-between text-xs">
                  <span className="flex-1 truncate text-ink-soft">{item.name}</span>
                  <span className="ml-2 shrink-0 font-medium">
                    {item.quantity} × {fmtMoney(item.unitPrice)} = {fmtMoney(item.total)} so'm
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

function QtyBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="grid h-5 w-5 place-items-center rounded border border-line bg-bg-soft text-ink hover:border-line-strong hover:bg-bg-elevated"
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
