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

  /* Kategoriya tartibi */
  const CAT_ORDER = ['asosiy taomlar','asosiy mahsulotlar','zakaz taomlar','salatlar','ichimliklar','go\'sht va shashliklar','maxsus taomlar']
  const sortedCategories = useMemo(() => {
    const seen = new Set<string>()
    return [...categories]
      .filter(c => {
        const key = (c.nameUzLatn ?? '').toLowerCase().trim()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => {
        const ai = CAT_ORDER.indexOf((a.nameUzLatn ?? '').toLowerCase())
        const bi = CAT_ORDER.indexOf((b.nameUzLatn ?? '').toLowerCase())
        if (ai === -1 && bi === -1) return 0
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  /* Mahsulotlar — dublikatsiz */
  /* Mahsulot nomidan litr/hajmni chiqarish */
  const extractVolume = (name: string): number => {
    // "1.L", "2.L", "1.5L", "2 L" hammasi uchun ishlaydi
    const m = name.match(/(\d+(?:[.,]\d+)?)\s*\.?\s*[Ll]/i)
    return m ? parseFloat(m[1].replace(',', '.')) : -1  // -1 = L yo'q → oxirida
  }

  /* Kategoriya ichidagi tartib: Asosiy → sortOrder, Salatlar → maxsus, Ichimliklar → hajm bo'yicha */
  /* Aniq mos kelish — uzunroq pattern avval tekshiriladi */
  const exactOrder = (name: string, orders: string[]): number => {
    const sorted = [...orders].map((s, i) => ({ s, i })).sort((a, b) => b.s.length - a.s.length)
    for (const { s, i } of sorted) {
      if (name.includes(s)) return i
    }
    return 99
  }

  const SALATLAR_ORDER = ['katta salat', 'qalampir', 'kichik salat']
  // Non 4000 → Choy → Salfetka → Nam Salfetka → Kata Non
  // 'kata non' avval tekshiriladi (uzunroq), keyin 'non'
  const ASOSIY_ORDER = ['non', 'choy', 'salfetka', 'nam salfetka', 'kata non']
  const GOSHT_ORDER = ['qiyma', "go'sht", "qo'y"]

  const shownProducts = useMemo<Product[]>(() => {
    const list = products.filter((p) => p.categoryId === activeCatId)
    const seen = new Set<string>()
    const unique = list.filter(p => {
      const key = (p.nameUzLatn ?? '').toLowerCase().trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const catName = (categories.find(c => c.id === activeCatId)?.nameUzLatn ?? '').toLowerCase()

    return [...unique].sort((a, b) => {
      const an = (a.nameUzLatn ?? '').toLowerCase()
      const bn = (b.nameUzLatn ?? '').toLowerCase()

      if (catName.includes('salat')) {
        const ai = exactOrder(an, SALATLAR_ORDER)
        const bi = exactOrder(bn, SALATLAR_ORDER)
        if (ai !== 99 || bi !== 99) return ai - bi
      }
      if (catName.includes('asosiy')) {
        const ai = exactOrder(an, ASOSIY_ORDER)
        const bi = exactOrder(bn, ASOSIY_ORDER)
        if (ai !== 99 || bi !== 99) return ai - bi
      }
      if (catName.includes("go'sht") || catName.includes('gosht')) {
        const ai = exactOrder(an, GOSHT_ORDER)
        const bi = exactOrder(bn, GOSHT_ORDER)
        if (ai !== 99 || bi !== 99) return ai - bi
      }
      if (catName.includes('ichimlik')) {
        // 2L birinchi, 1.5L ikkinchi, 1L uchinchi, qolganlar oxirida
        const av = extractVolume(a.nameUzLatn ?? '')
        const bv = extractVolume(b.nameUzLatn ?? '')
        if (av !== bv) return bv - av  // katta hajm birinchi
      }
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, activeCatId, categories])

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
              localOrderId: orderId ?? undefined,
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
              localOrderId: orderId ?? undefined,
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
        organizationAddress: settings?.organizationAddress ?? null,
        organizationPhone: settings?.organizationPhone ?? null,
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
        receiptFooter: settings?.receiptFooter ?? null,
        receiptQrText: settings?.receiptQrText ?? null,
        receiptQrLabel: settings?.receiptQrLabel ?? null
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
    <div className="grid h-full" style={{ gridTemplateColumns: '210px 1fr 340px' }}>

      {/* ── CHAP SIDEBAR: Kategoriyalar ── */}
      <aside style={{ background: '#1e293b', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ padding: '14px 10px 12px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          <button onClick={() => void handleSave()} disabled={saving || printing}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              background: '#dc2626', border: 'none',
              borderRadius: 8, cursor: 'pointer', color: '#ffffff',
              fontSize: 12, fontWeight: 700,
              padding: '7px 10px', marginBottom: 10, width: '100%',
              boxShadow: '0 2px 8px rgba(220,38,38,0.35)',
            }}
          >
            <ArrowLeft size={12} /> Orqaga
          </button>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>{table.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Buyurtma</p>
        </div>

        {/* Kategoriyalar label */}
        <div style={{ padding: '12px 10px 5px' }}>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Kategoriyalar</p>
        </div>

        {/* Kategoriyalar list */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 8px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortedCategories.map((c) => (
            <CategoryBtn
              key={c.id}
              label={c.nameUzLatn ?? ''}
              active={c.id === activeCatId}
              onClick={() => setActiveCatId(c.id)}
            />
          ))}
        </nav>

        {/* User info */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#ffffff', lineHeight: 1.3 }}>{waiter.firstName} {waiter.lastName}</p>
          <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {waiter.role === 'manager' ? 'Manager' : 'Afitsant'}
          </p>
        </div>
      </aside>

      {/* ── MARKAZ: Mahsulotlar ── */}
      <section style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f1f5f9' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px' }}>
          {shownProducts.length === 0 ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#94a3b8' }}>
              Bu kategoriyada mahsulot yo'q
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
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

function CategoryBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '11px 12px', borderRadius: 10,
        border: active ? '1.5px solid #2563eb' : '1.5px solid rgba(255,255,255,0.08)',
        cursor: 'pointer', textAlign: 'left', fontSize: 15, fontWeight: 700,
        background: active ? '#2563eb' : 'rgba(255,255,255,0.05)',
        color: '#fff', lineHeight: 1.3,
        boxShadow: active ? '0 2px 10px rgba(37,99,235,0.4)' : 'none',
      }}
    >
      {label}
    </button>
  )
}

const TAB_COLORS = ['#C2410C','#2563eb','#059669','#7c3aed','#d97706','#0891b2','#be123c']

function CategoryPill({
  cat, active, onClick, idx
}: {
  cat: Category; active: boolean; onClick: () => void; idx: number
}): JSX.Element {
  const color = cat.color || TAB_COLORS[idx % TAB_COLORS.length]
  return (
    <button
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all"
      style={active
        ? { background: color, borderColor: color, color: 'white', boxShadow: `0 2px 8px ${color}50` }
        : { background: 'white', borderColor: `${color}50`, color: '#374151' }
      }
    >
      <span style={{ color: active ? 'rgba(255,255,255,0.85)' : color }}>
        {CAT_ICON[cat.icon ?? ''] ?? <Package size={16} />}
      </span>
      {cat.nameUzLatn}
    </button>
  )
}

function ProductImage({ imgSrc, name, emoji, qty }: { imgSrc: string | null; name: string; emoji?: string | null; qty: number }): JSX.Element {
  const [failed, setFailed] = useState(false)
  if (imgSrc && !failed) {
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-white">
        <img
          src={imgSrc}
          alt={name}
          className="h-full w-full object-contain p-2"
          onError={() => setFailed(true)}
        />
        {qty > 0 && <div className="absolute inset-x-0 bottom-0 h-1 bg-[#C2410C]" />}
      </div>
    )
  }
  return (
    <div className={cn('flex aspect-square items-center justify-center text-5xl', qty > 0 ? 'bg-[#C2410C]/5' : 'bg-stone-50')}>
      {emoji ?? '📦'}
    </div>
  )
}

function ProductCard({ product, idx }: { product: Product; idx: number }): JSX.Element {
  const lines = useCart((s) => s.lines)
  const add = useCart((s) => s.add)
  const qty = lines.filter((l) => l.productId === product.id).reduce((s, l) => s + l.quantity, 0)
  const [showKgModal, setShowKgModal] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [imgError, setImgError] = useState(false)
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
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: idx * 0.012 }}
        whileTap={{ scale: 0.96 }}
        whileHover={{ y: -3, transition: { duration: 0.12 } }}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 14,
          cursor: 'pointer',
          background: '#ffffff',
          border: qty > 0 || hovered ? '2px solid #2563eb' : '2px solid #e2e8f0',
          boxShadow: qty > 0 ? '0 4px 16px rgba(37,99,235,0.18)' : hovered ? '0 6px 20px rgba(37,99,235,0.15)' : '0 2px 6px rgba(0,0,0,0.07)',
          transition: 'border .15s, box-shadow .18s',
          userSelect: 'none',
        }}
      >
        {/* Aktiv holat — yuqori chiziq */}
        {qty > 0 && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#2563eb', zIndex: 1 }} />
        )}

        {/* Miqdor badge */}
        {qtyLabel && (
          <div style={{
            position: 'absolute', top: 8, right: 8, zIndex: 2,
            background: '#2563eb', color: 'white',
            borderRadius: 99, padding: '3px 9px',
            fontSize: 11, fontWeight: 800,
            boxShadow: '0 2px 8px rgba(37,99,235,0.4)',
          }}>
            {qtyLabel}
          </div>
        )}

        {imgSrc && !imgError ? (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1', overflow: 'hidden', background: '#f8fafc' }}>
            <img
              src={imgSrc}
              alt={product.nameUzLatn}
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 0 }}
              onError={() => setImgError(true)}
            />
          </div>
        ) : (
          <div style={{ width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, background: '#f8fafc' }}>
            {product.emoji ?? '📦'}
          </div>
        )}

        <div style={{ padding: '8px 10px 10px', background: '#1e293b' }}>
          <p style={{ margin: '0 0 4px', color: '#ffffff', fontSize: 14, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {product.nameUzLatn}
          </p>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
            {fmtMoney(product.price)}
            <span style={{ fontSize: 11, fontWeight: 400, color: '#64748b', marginLeft: 2 }}>
              so'm{product.unit === 'kg' ? ' / kg' : ''}
            </span>
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
    <aside style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#ffffff', borderLeft: '1px solid #e2e8f0' }}>

      {/* Sync warning */}
      {syncWarning && lines.length > 0 && (
        <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '7px 12px', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: 10, color: '#92400e', fontWeight: 600, lineHeight: 1.4 }}>
            {!roomServerId ? "Xona server bilan bog'lanmagan." : "Mahsulotlar server bilan bog'lanmagan."} Sozlamalar → To'liq sinxronlash.
          </p>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '12px 14px', background: '#fff', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#16a34a', display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}>
            <ShoppingCart size={16} color="white" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Savat</p>
            <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{table.name}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {historyEntries.length > 0 && (
            <button
              onClick={() => setShowHistory((v) => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: showHistory ? '#eff6ff' : '#f8fafc',
                border: `1px solid ${showHistory ? '#bfdbfe' : '#e2e8f0'}`,
                color: showHistory ? '#2563eb' : '#64748b',
                borderRadius: 7, padding: '4px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Printer size={11} />
              Tarix ({historyEntries.length})
            </button>
          )}
          <div style={{ minWidth: 26, height: 26, borderRadius: 99, background: lines.length > 0 ? '#16a34a' : '#e2e8f0', display: 'grid', placeItems: 'center', padding: '0 7px' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: lines.length > 0 ? 'white' : '#94a3b8' }}>{lines.length}</span>
          </div>
        </div>
      </div>

      {/* Savat yoki tarix */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px', background: '#f8fafc' }}>
        <AnimatePresence mode="wait">
          {showHistory ? (
            <motion.div key="history"
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15 }}
            >
              <p style={{ margin: '4px 4px 8px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {table.name} — Zakazlar tarixi
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {historyEntries.map((entry) => (
                  <HistoryEntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </motion.div>
          ) : (
            <motion.div key="cart"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.15 }}
              style={{ height: lines.length === 0 ? '100%' : undefined }}
            >
              {lines.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 16, background: '#eff6ff', display: 'grid', placeItems: 'center' }}>
                    <ShoppingCart size={22} color="#93c5fd" />
                  </div>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>Mahsulot tanlanmagan</span>
                </div>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {lines.map((l, i) => (
                    <li key={l.localUuid} style={{
                      background: 'white', borderRadius: 10, padding: '10px 12px',
                      border: '1px solid #f1f5f9',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                      {/* Nomi + o'chirish */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', lineHeight: 1.3, flex: 1 }}>
                          <span style={{ color: '#94a3b8', fontWeight: 500, marginRight: 4 }}>{i + 1}.</span>
                          {l.productName}
                        </span>
                        <button onClick={() => rem(l.localUuid)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '1px 3px', borderRadius: 5, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {/* Qty + narx */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', borderRadius: 8, padding: '3px 6px', border: '1px solid #e2e8f0' }}>
                          <QtyBtn onClick={() => dec(l.localUuid)} color="red"><Minus size={9} /></QtyBtn>
                          <span style={{ minWidth: 24, textAlign: 'center', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{fmtQty(l.quantity)}</span>
                          <QtyBtn onClick={() => inc(l.localUuid)} color="green"><Plus size={9} /></QtyBtn>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                          {fmtMoney(Math.round(l.unitPrice * l.quantity))}
                          <span style={{ fontSize: 10, fontWeight: 400, color: '#64748b', marginLeft: 2 }}>so'm</span>
                        </span>
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
      <div style={{ background: '#fff', borderTop: '1px solid #e2e8f0', padding: '10px 12px 12px', flexShrink: 0 }}>
        {/* Jami blok */}
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '9px 12px', marginBottom: 9, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Mahsulotlar</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>{fmtMoney(subtotal)} so'm</span>
          </div>
          {fee > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>Xizmat ({feePct}%)</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>{fmtMoney(fee)} so'm</span>
            </div>
          )}
          <div style={{ height: 1, background: '#e2e8f0', margin: '7px 0 6px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Jami</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
              {fmtMoney(total)}
              <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b', marginLeft: 3 }}>so'm</span>
            </span>
          </div>
        </div>

        {/* Tugmalar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <button onClick={() => void onSave()} disabled={saving || printing}
            style={{ width: '100%', height: 42, borderRadius: 9, border: 'none', background: saving || printing ? '#bfdbfe' : '#2563eb', color: 'white', fontSize: 13, fontWeight: 700, cursor: saving || printing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: saving || printing ? 'none' : '0 2px 8px rgba(37,99,235,0.3)' }}>
            <Save size={14} /> {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
          <button onClick={onClosePrint} disabled={lines.length === 0 || printing || saving}
            style={{ width: '100%', height: 42, borderRadius: 9, border: 'none', background: lines.length === 0 ? '#dcfce7' : '#16a34a', color: lines.length === 0 ? '#86efac' : 'white', fontSize: 13, fontWeight: 700, cursor: lines.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: lines.length > 0 ? '0 2px 8px rgba(22,163,74,0.28)' : 'none' }}>
            <Printer size={14} /> {printing ? 'Chiqarilmoqda…' : 'Chek & Yopish'}
          </button>
          <button onClick={onCancel} disabled={saving || printing || lines.length === 0}
            style={{ width: '100%', height: 36, borderRadius: 9, border: '1px solid #fecaca', background: 'transparent', color: lines.length === 0 ? '#fca5a5' : '#ef4444', fontSize: 12, fontWeight: 600, cursor: lines.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <Ban size={12} /> Zakazni bekor qilish
          </button>
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

function QtyBtn({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color?: 'red'|'green' }): JSX.Element {
  const bg = color === 'red' ? '#dc2626' : color === 'green' ? '#16a34a' : '#000000'
  return (
    <button
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-lg font-bold"
      style={{ background: bg, color: '#ffffff', border: 'none', fontSize: 14, flexShrink: 0 }}
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
