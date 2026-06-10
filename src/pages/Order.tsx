import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  Ban,
  Tag
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
  'chef-hat': <ChefHat size={18} />,
}

const getCatIcon = (name: string): JSX.Element => {
  const n = name.toLowerCase()
  if (n.includes('ichimlik')) return <CupSoda size={16} />
  if (n.includes('salat')) return <Leaf size={16} />
  if (n.includes('shashlik') || n.includes("go'sht") || n.includes('gosht') || n.includes('qanot')) return <Flame size={16} />
  if (n.includes('asosiy') || n.includes('maxsus') || n.includes('zakaz')) return <ChefHat size={16} />
  return <Package size={16} />
}

export default function OrderPage(): JSX.Element {
  const { tableId } = useParams<{ tableId: string }>()
  const tId = Number(tableId)
  const navigate = useNavigate()
  const waiter = useAuth((s) => s.waiter)!
  const { categories, products } = useMenu()
  const settings = useSettings((s) => s.settings)
  const refreshTable = useTables((s) => s.refreshTable)
  const lang = settings?.language ?? 'uz-latn'
  const dn = (latn: string, cyrl: string | null): string => (lang === 'uz-cyrl' && cyrl) ? cyrl : latn

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
            // Server dagi items ni eslab qolamiz — o'chirilganlarni aniqlash uchun (tok o'chib yongan holat)
            initialServerItemsRef.current = existingOrder.items.map<CartLine>((it) => {
              const prod = products.find((p) => p.id === it.productId || (it.serverId != null && p.serverId === it.serverId))
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
            const product = products.find((p) => p.id === it.productId || (it.serverId != null && p.serverId === it.serverId))
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
          if (cancelled) return
          // Local order YARATMAYMIZ — faqat ko'rsatamiz. Saqlashda lazy yaratiladi.
          cart.setOrder(null, tId, existingOrder.serverId ?? null, roomServerId)
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

  /* Kategoriya tartibi — DB dagi sort_order_override dan keladi, qayta sort kerak emas */
  const sortedCategories = useMemo(() => {
    const seen = new Set<string>()
    return [...categories]
      .filter(c => {
        const key = (c.nameUzLatn ?? '').toLowerCase().trim()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [categories])

  const extractVolume = (name: string): number => {
    const m = name.match(/(\d+(?:[.,]\d+)?)\s*\.?\s*[Ll]/i)
    return m ? parseFloat(m[1].replace(',', '.')) : -1
  }

  const exactOrder = (name: string, orders: string[]): number => {
    const sorted = [...orders].map((s, i) => ({ s, i })).sort((a, b) => b.s.length - a.s.length)
    for (const { s, i } of sorted) {
      if (name.includes(s)) return i
    }
    return 99
  }

  const SALATLAR_ORDER = ['katta salat', 'qalampir', 'kichik salat']
  const ASOSIY_ORDER = ['non', 'choy', 'salfetka', 'nam salfetka', 'kata non']
  const GOSHT_ORDER = ['qiyma', "go'sht", "qo'y"]

  const shownProducts = useMemo<Product[]>(() => {
    const list = products.filter((p) => p.categoryId === activeCatId && p.isAvailable)
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

      const aLast = an.includes('yarimta')
      const bLast = bn.includes('yarimta')
      if (aLast !== bLast) return aLast ? 1 : -1

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
        const av = extractVolume(a.nameUzLatn ?? '')
        const bv = extractVolume(b.nameUzLatn ?? '')
        if (av !== bv) return bv - av
      }

      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, activeCatId, categories])

  const handleSave = async (): Promise<void> => {
    if (cart.lines.length === 0) {
      // Savat bo'sh — faqat LOCAL order bo'lsa bekor qilamiz
      // Server orderni tegmaymiz (foydalanuvchi faqat ko'rib chiqdi)
      const orderId = cart.orderId
      const serverOrderId = useCart.getState().serverOrderId
      if (orderId && orderId > 0) {
        setSaving(true)
        try {
          await window.afisant.orders.cancel(orderId, serverOrderId ?? undefined)
          cart.clear()
          cart.setOrder(null, null)
          await refreshTable(tId)
          toast.info("Savat bo'sh — buyurtma bekor qilindi")
        } catch (e: any) {
          toast.error('Bekor qilishda xatolik', { description: e?.message })
        } finally {
          setSaving(false)
        }
      }
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

      // Mahsulotlar snapshot — navigate oldidan saqlaymiz (background sync uchun)
      const savedLines = [...cart.lines]

      // Server dan o'chirilgan mahsulotlar
      const removedFromServer = initialServerItemsRef.current.filter(
        (init) => init.productServerId &&
          !savedLines.some((l) => l.productServerId === init.productServerId)
      )

      // Har doim local SQLite ga saqlash (offline persistence uchun)
      await window.afisant.orders.replaceItems(
        orderId,
        savedLines.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          notes: l.notes ?? null,
          localUuid: l.localUuid
        }))
      )

      // Darhol navigatsiya — server sinxronini kutmaymiz (sekinlikni hal qilish)
      await refreshTable(tId)
      cart.clear()
      cart.setOrder(null, null)
      navigate('/tables')

      // Server sinxronini fon rejimida bajaramiz (UI bloklash yo'q)
      if (!roomServerId) return

      const itemsWithServerId = savedLines.filter((l) => l.productServerId && l.quantity > 0)
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
        void window.afisant.orders.syncAll({
          localOrderId: orderId ?? undefined,
          roomServerId,
          items: syncItems
        }).catch((e: any) => {
          console.warn('[handleSave] Background server sync failed:', e?.message)
        })
      } else if (savedLines.length > 0 && savedLines.every((l) => !l.productServerId)) {
        console.warn('[handleSave] Mahsulotlarda server ID yo\'q — To\'liq sinxronlash kerak')
      }
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
      const currentServerOrderId = useCart.getState().serverOrderId
      const fee = settings?.serviceFeePercent ?? 0

      // Mahsulotlar snapshot — navigate oldidan saqlaymiz
      const savedLines = [...cart.lines]

      // Lazy order creation — mahsulot bor bo'lsa SQLite buyurtma yaratamiz
      let orderId = cart.orderId
      if (!orderId && savedLines.length > 0) {
        const baseOrder = await window.afisant.orders.upsert({
          tableId: tId,
          waiterId: waiter.id,
          serviceFeePercent: fee
        })
        orderId = baseOrder.id
        useCart.setState({ orderId: baseOrder.id })
      }

      // Items ni SQLite ga saqlash — offline bo'lganda sync uchun ZARUR
      // Bu bo'lmasdan syncPendingOrders items topa olmaydi va server ga yubora olmaydi
      if (orderId && savedLines.length > 0) {
        await window.afisant.orders.replaceItems(
          orderId,
          savedLines.map((l) => ({
            productId: l.productId,
            productName: l.productName,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            notes: l.notes ?? null,
            localUuid: l.localUuid
          }))
        )
      }

      // Mahalliy yopamiz (tez, faqat SQLite) — navigatsiyani bloklash yo'q
      if (orderId && orderId > 0) {
        await window.afisant.orders.close(orderId)
      }

      const payload: ReceiptPayload = {
        organizationName: settings?.organizationName ?? 'Restoran',
        organizationAddress: settings?.organizationAddress ?? null,
        organizationPhone: settings?.organizationPhone ?? null,
        tableName: table.name,
        waiterName: `${waiter.firstName} ${waiter.lastName}`,
        orderLocalUuid: currentServerOrderId ?? String(orderId ?? 'unkwn'),
        items: savedLines.map((l) => ({
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

      // Tarixga yozamiz va chop etilgan deb belgilaymiz
      const histId = useOrderHistory.getState().push({
        tableId: tId,
        tableName: table.name,
        waiterName: [waiter.lastName, waiter.firstName].filter(Boolean).join(' '),
        savedAt: Date.now(),
        items: payload.items,
        subtotal: payload.subtotal,
        serviceFee: payload.serviceFee,
        total: payload.total
      })
      useOrderHistory.getState().markPrinted(histId)

      // Chek chiqarish
      const res = await window.afisant.printer.receipt(payload)
      if (!res.ok) {
        if (settings?.printerType) {
          toast.error("Chek chiqarib bo'lmadi", { description: (res as any).error })
        } else {
          toast.message("Printer ulanmagan — chek o'tkazib yuborildi")
        }
      } else {
        toast.success('Chek chiqdi (2 nusxa)')
      }

      // Darhol navigatsiya — server yopishini kutmaymiz
      cart.clear()
      cart.setOrder(null, null)
      await refreshTable(tId)
      navigate('/tables')

      // Fon rejimida: server sinxronlash + server da yopish
      if (roomServerId || currentServerOrderId) {
        void (async () => {
          try {
            let serverOrderId = currentServerOrderId
            // serverOrderId bo'lsa ham bo'lmasa ham — har doim items ni sync qilamiz
            if (roomServerId && savedLines.length > 0) {
              const itemsWithServerId = savedLines.filter((l) => l.productServerId && l.quantity > 0)
              if (itemsWithServerId.length > 0) {
                const syncRes = await window.afisant.orders.syncAll({
                  localOrderId: orderId ?? undefined,
                  roomServerId,
                  items: itemsWithServerId.map((l) => ({
                    productServerId: l.productServerId!,
                    count: Math.round(l.quantity)
                  }))
                })
                serverOrderId = syncRes.serverId
              }
            }
            if (serverOrderId) {
              // Server da yopamiz (faqat server, local allaqachon yopilgan)
              await window.afisant.orders.close(0, serverOrderId)
            }
          } catch (e: any) {
            console.warn('[handleCloseAndPrint] Background server close failed:', e?.message)
          }
        })()
      }
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
    <div className="grid h-full" style={{ gridTemplateColumns: 'clamp(130px, 14vw, 170px) 1fr clamp(260px, 26vw, 360px)' }}>

      {/* ── CHAP SIDEBAR: Kategoriyalar ── */}
      <aside style={{ background: '#1E2C46', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ padding: '10px 10px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={() => void handleSave()} disabled={saving || printing}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              background: 'linear-gradient(145deg,#ef4444,#dc2626)',
              border: 'none',
              borderRadius: 8, cursor: 'pointer', color: '#ffffff',
              fontSize: 12, fontWeight: 700,
              padding: '7px 10px', marginBottom: 10, width: '100%',
              boxShadow: '0 3px 10px rgba(220,38,38,0.40)',
            }}
          >
            <ArrowLeft size={12} /> Orqaga
          </button>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>{table.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Buyurtma</p>
        </div>

        {/* Kategoriyalar list */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '22px 8px 10px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {sortedCategories.map((c) => (
            <CategoryBtn
              key={c.id}
              label={dn(c.nameUzLatn ?? '', c.nameUzCyrl ?? null)}
              active={c.id === activeCatId}
              onClick={() => setActiveCatId(c.id)}
            />
          ))}
        </nav>

      </aside>

      {/* ── MARKAZ: Mahsulotlar ── */}
      <section style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#D2D0D1' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px' }}>
          {shownProducts.length === 0 ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#94a3b8' }}>
              Bu kategoriyada mahsulot yo'q
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(140px, 18vw, 220px), 1fr))' }}>
              {shownProducts.map((p, idx) => (
                <ProductCard key={p.id} product={p} idx={idx} catName={(categories.find(c => c.id === activeCatId)?.nameUzLatn ?? '').toLowerCase()} />
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
    </div>
  )
}

function CategoryBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '15px 14px',
        borderRadius: 14,
        cursor: 'pointer',
        textAlign: 'center',
        fontSize: 15,
        fontWeight: 900,
        lineHeight: 1.25,
        letterSpacing: '0.02em',
        transition: 'all 0.15s ease',
        ...(active ? {
          background: '#ffffff',
          border: '2.5px solid #ffffff',
          color: '#0f172a',
          boxShadow: '0 8px 24px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25)',
          textShadow: 'none',
        } : {
          background: 'linear-gradient(160deg, #22c55e 0%, #15803d 100%)',
          border: '2.5px solid #16a34a',
          color: '#ffffff',
          boxShadow: '0 5px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.28)',
          textShadow: '0 1px 3px rgba(0,0,0,0.40)',
        }),
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
  const lang = useSettings((s) => s.settings?.language ?? 'uz-latn')
  const label = (lang === 'uz-cyrl' && cat.nameUzCyrl) ? cat.nameUzCyrl : cat.nameUzLatn
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
      {label}
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

function ProductCard({ product, idx, catName = '' }: { product: Product; idx: number; catName?: string }): JSX.Element {
  const lines = useCart((s) => s.lines)
  const add = useCart((s) => s.add)
  const lang = useSettings((s) => s.settings?.language ?? 'uz-latn')
  const displayName = (lang === 'uz-cyrl' && product.nameUzCyrl) ? product.nameUzCyrl : product.nameUzLatn
  const qty = lines.filter((l) => l.productId === product.id).reduce((s, l) => s + l.quantity, 0)
  const [showKgModal, setShowKgModal] = useState(false)
  const [flashing, setFlashing] = useState(false)
  const [imgError, setImgError] = useState(false)
  const imgSrc = useCachedImage(product.photo)

  const isIchimlik = catName.includes('ichimlik')
  const isLitr = !isIchimlik && isLiterProduct(product.nameUzLatn)

  const handleClick = (): void => {
    if (product.unit === 'kg' || isLitr) setShowKgModal(true)
    else {
      add(product)
      setFlashing(true)
      setTimeout(() => setFlashing(false), 200)
    }
  }

  const qtyLabel = qty > 0
    ? (product.unit === 'kg' || isLitr)
        ? `${qty} ${isLitr ? 'L' : 'kg'}`
        : `${qty} ta`
    : null

  return (
    <>
      <div
        onClick={handleClick}
        className={flashing ? 'product-card product-card-flash' : 'product-card'}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 18,
          cursor: 'pointer',
          background: '#ffffff',
          border: qty > 0 ? '2.5px solid #f59e0b' : '2px solid #ede8df',
          boxShadow: qty > 0 ? '0 6px 20px rgba(245,158,11,0.30)' : '0 3px 12px rgba(0,0,0,0.08)',
          transition: 'border-color .18s ease, box-shadow .18s ease',
          userSelect: 'none',
        }}
      >
        {qtyLabel && (
          <div style={{
            position: 'absolute', top: 8, right: 8, zIndex: 2,
            background: '#d97706', color: 'white',
            borderRadius: 99, padding: '3px 9px',
            fontSize: 11, fontWeight: 800,
            boxShadow: '0 2px 8px rgba(217,119,6,0.45)',
          }}>
            {qtyLabel}
          </div>
        )}

        {imgSrc && !imgError ? (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1', overflow: 'hidden', background: '#ffffff' }}>
            <img
              src={imgSrc}
              alt={product.nameUzLatn}
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 0 }}
              onError={() => setImgError(true)}
            />
          </div>
        ) : (
          <div style={{ width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, background: '#ffffff' }}>
            {product.emoji ?? '📦'}
          </div>
        )}

        <div style={{ padding: '10px 12px 13px', background: '#F5F5F5', borderTop: '1px solid #EBEBEB' }}>
          <p style={{ margin: '0 0 6px', color: '#1a1209', fontSize: 16, fontWeight: 900, lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {displayName}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ background: '#d97706', borderRadius: 6, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(217,119,6,0.50)' }}>
              <Tag size={13} color="#ffffff" strokeWidth={2.5} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 900, color: '#1a1209', letterSpacing: '-0.4px' }}>
              {fmtMoney(product.price)}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9c8a70' }}>
              so'm{(product.unit === 'kg' || isLitr) ? ` / ${isLitr ? 'L' : 'kg'}` : ''}
            </span>
          </div>
        </div>
      </div>

      {showKgModal && (
        <KgModal
          product={product}
          onClose={() => setShowKgModal(false)}
          onAdd={(weight) => { add(product, weight); setShowKgModal(false) }}
        />
      )}
    </>
  )
}

// Raqamli klaviatura — sistem klaviatura chiqmaydi
const NUMPAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'] as const

const isLiterProduct = (name: string): boolean => /\d+(?:[.,]\d+)?\s*\.?\s*[Ll]/i.test(name)

function KgModal({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (weight: number) => void }): JSX.Element {
  const isLitr = isLiterProduct(product.nameUzLatn)
  const unitLabel = isLitr ? 'L' : 'KG'
  // mode: 'kg' — KG/L yozyapmiz, 'som' — so'm yozyapmiz
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
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 320, borderRadius: 26, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)', boxShadow: '0 40px 100px rgba(0,0,0,0.50), 0 0 0 1px rgba(255,255,255,0.8)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1E2C46, #162038)', padding: '16px 18px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 900, fontSize: 15, color: '#ffffff', letterSpacing: '-0.2px' }}>{product.nameUzLatn}</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#4ade80', fontWeight: 700 }}>{fmtMoney(product.price)} so'm / {unitLabel.toLowerCase()}</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.20)', cursor: 'pointer', width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', color: '#ffffff' }}>
            <X size={15} />
          </button>
        </div>

        {/* KG / So'm display — tepada */}
        <div style={{ display: 'flex', borderBottom: '2px solid #f1f5f9' }}>
          <button onClick={() => switchMode('kg')} style={{
            flex: 1, padding: '14px 16px', textAlign: 'left', border: 'none', cursor: 'pointer',
            background: mode === 'kg' ? '#f0fdf4' : '#fafafa',
            borderRight: '2px solid #f1f5f9',
            borderBottom: mode === 'kg' ? '3px solid #16a34a' : '3px solid transparent',
            transition: 'all 0.15s'
          }}>
            <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 800, color: mode === 'kg' ? '#16a34a' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.10em' }}>{unitLabel}</p>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: mode === 'kg' ? '#14532d' : '#cbd5e1', fontFamily: 'monospace', letterSpacing: '-1px' }}>
              {mode === 'kg' ? (kgVal || '0') : (parsedSom > 0 ? (parsedSom / product.price).toFixed(3).replace(/\.?0+$/, '') : displayKg)}
            </p>
          </button>
          <button onClick={() => switchMode('som')} style={{
            flex: 1, padding: '14px 16px', textAlign: 'left', border: 'none', cursor: 'pointer',
            background: mode === 'som' ? '#eff6ff' : '#fafafa',
            borderBottom: mode === 'som' ? '3px solid #2563eb' : '3px solid transparent',
            transition: 'all 0.15s'
          }}>
            <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 800, color: mode === 'som' ? '#2563eb' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.10em' }}>SO'M</p>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: mode === 'som' ? '#1d4ed8' : '#cbd5e1', fontFamily: 'monospace', letterSpacing: '-1px' }}>
              {mode === 'som' ? (somVal || '0') : displaySom}
            </p>
          </button>
        </div>

        {/* Numpad */}
        <div style={{ padding: '12px 14px 8px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {NUMPAD_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => handleKey(key)}
              style={{
                height: 56, borderRadius: 14,
                border: key === '⌫' ? '2px solid #fecaca' : '2px solid #e8edf5',
                cursor: 'pointer',
                fontSize: key === '⌫' ? 20 : 23,
                fontWeight: 900,
                background: key === '⌫' ? '#fff0f0' : 'rgba(255,255,255,0.90)',
                color: key === '⌫' ? '#ef4444' : '#0f172a',
                display: 'grid', placeItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)',
                transition: 'all 0.10s',
              }}
              onMouseDown={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = key === '⌫' ? '#fecaca' : '#dbeafe'
                el.style.transform = 'scale(0.94)'
              }}
              onMouseUp={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = key === '⌫' ? '#fff0f0' : 'rgba(255,255,255,0.90)'
                el.style.transform = 'scale(1)'
              }}
            >
              {key}
            </button>
          ))}
        </div>

        {/* Tugmalar */}
        <div style={{ padding: '12px 14px 16px', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, height: 50, borderRadius: 14,
            border: '2px solid #e2e8f0', background: '#f8fafc',
            color: '#475569', fontSize: 14, fontWeight: 800, cursor: 'pointer',
          }}>
            Bekor
          </button>
          <button
            onClick={() => { if (canAdd && finalKg > 0) onAdd(finalKg) }}
            disabled={!canAdd || finalKg <= 0}
            style={{
              flex: 1.8, height: 50, borderRadius: 14, border: 'none',
              fontSize: 14, fontWeight: 900, cursor: canAdd ? 'pointer' : 'not-allowed',
              background: canAdd ? 'linear-gradient(145deg, #22c55e, #15803d)' : '#e2e8f0',
              color: canAdd ? '#ffffff' : '#94a3b8',
              boxShadow: canAdd ? '0 6px 16px rgba(34,197,94,0.40)' : 'none',
            }}
          >
            {canAdd ? `+ Qo'shish (${finalKg.toFixed(2).replace(/\.?0+$/, '')} kg)` : `+ Qo'shish`}
          </button>
        </div>
      </div>
    </div>
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
    <aside style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#2C2C2D', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>

      {/* Sync warning */}
      {syncWarning && lines.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.15)', borderBottom: '1px solid rgba(245,158,11,0.25)', padding: '7px 12px', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: 10, color: '#fbbf24', fontWeight: 600, lineHeight: 1.4 }}>
            {!roomServerId ? "Xona server bilan bog'lanmagan." : "Mahsulotlar server bilan bog'lanmagan."} Sozlamalar → To'liq sinxronlash.
          </p>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '12px 14px', background: '#2C2C2D', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#16a34a', display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}>
            <ShoppingCart size={16} color="white" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#ffffff' }}>Savat</p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{table.name}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {historyEntries.length > 0 && (
            <button
              onClick={() => setShowHistory((v) => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: showHistory ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.07)',
                border: `1px solid ${showHistory ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.10)'}`,
                color: showHistory ? '#4ade80' : 'rgba(255,255,255,0.6)',
                borderRadius: 7, padding: '4px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Printer size={11} />
              Tarix ({historyEntries.length})
            </button>
          )}
          <div style={{ minWidth: 26, height: 26, borderRadius: 99, background: lines.length > 0 ? '#16a34a' : 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', padding: '0 7px' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: lines.length > 0 ? 'white' : 'rgba(255,255,255,0.4)' }}>{lines.length}</span>
          </div>
        </div>
      </div>

      {/* Savat yoki tarix */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px', background: '#2C2C2D' }}>
        {showHistory ? (
          <div>
              <p style={{ margin: '4px 4px 8px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {table.name} — Zakazlar tarixi
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {historyEntries.map((entry) => (
                  <HistoryEntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
          </div>
        ) : (
          <div style={{ height: lines.length === 0 ? '100%' : undefined }}>
              {lines.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,255,255,0.07)', display: 'grid', placeItems: 'center' }}>
                    <ShoppingCart size={22} color="rgba(255,255,255,0.25)" />
                  </div>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>Mahsulot tanlanmagan</span>
                </div>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {lines.map((l, i) => (
                    <li key={l.localUuid} style={{
                      background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '11px 13px',
                      border: '1.5px solid rgba(255,255,255,0.09)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }}>
                      {/* Nomi + o'chirish */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 9, gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', lineHeight: 1.3, flex: 1, letterSpacing: '-0.2px' }}>
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700, marginRight: 4 }}>{i + 1}.</span>
                          {l.productName}
                        </span>
                        <button onClick={() => rem(l.localUuid)}
                          style={{ background: 'rgba(239,68,68,0.12)', border: '1.5px solid rgba(239,68,68,0.3)', cursor: 'pointer', color: '#f87171', padding: '4px 6px', borderRadius: 7, display: 'grid', placeItems: 'center', flexShrink: 0 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.22)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {/* Qty + narx */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 9, padding: '4px 7px', border: '1.5px solid rgba(255,255,255,0.10)' }}>
                          <QtyBtn onClick={() => dec(l.localUuid)} color="red"><Minus size={10} /></QtyBtn>
                          <span style={{ minWidth: 26, textAlign: 'center', fontSize: 16, fontWeight: 900, color: '#ffffff' }}>{fmtQty(l.quantity)}</span>
                          <QtyBtn onClick={() => inc(l.localUuid)} color="green"><Plus size={10} /></QtyBtn>
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 900, color: '#fbbf24', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
                          {fmtMoney(Math.round(l.unitPrice * l.quantity))}
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginLeft: 2 }}>so'm</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ background: '#2C2C2D', borderTop: '1px solid rgba(255,255,255,0.07)', padding: '10px 12px 12px', flexShrink: 0 }}>
        {/* Jami blok */}
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '11px 14px', marginBottom: 9, border: '1.5px solid rgba(255,255,255,0.09)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>Mahsulotlar</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#ffffff' }}>{fmtMoney(subtotal)} so'm</span>
          </div>
          {fee > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>Xizmat ({feePct}%)</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#ffffff' }}>{fmtMoney(fee)} so'm</span>
            </div>
          )}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.10)', margin: '8px 0 7px', borderRadius: 99 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#ffffff' }}>Jami</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#4ade80', fontFamily: 'monospace', letterSpacing: '-1px' }}>
              {fmtMoney(total)}
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(74,222,128,0.6)', marginLeft: 3 }}>so'm</span>
            </span>
          </div>
        </div>

        {/* Tugmalar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <button onClick={onClosePrint} disabled={lines.length === 0 || printing || saving}
            style={{ width: '100%', height: 50, borderRadius: 9, border: 'none', background: lines.length === 0 || printing || saving ? 'rgba(22,163,74,0.40)' : '#16a34a', color: 'white', fontSize: 14, fontWeight: 600, cursor: lines.length === 0 || printing || saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: lines.length > 0 && !printing && !saving ? '0 4px 12px rgba(22,163,74,0.35)' : 'none' }}>
            <Printer size={16} /> {printing ? 'Chiqarilmoqda…' : 'Chek & Yopish'}
          </button>
          <button onClick={() => void onSave()} disabled={saving || printing}
            style={{ width: '100%', height: 44, borderRadius: 9, border: '1.5px solid #D1D5DB', background: '#ffffff', color: saving || printing ? '#9CA3AF' : '#374151', fontSize: 13, fontWeight: 500, cursor: saving || printing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Save size={14} /> {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
          <button onClick={onCancel} disabled={saving || printing || lines.length === 0}
            style={{ width: '100%', height: 36, borderRadius: 9, border: '1px solid rgba(220,38,38,0.30)', background: 'transparent', color: lines.length === 0 || saving || printing ? 'rgba(220,38,38,0.35)' : '#DC2626', fontSize: 12, fontWeight: 500, cursor: lines.length === 0 || saving || printing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
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
      {open && (
        <div className="overflow-hidden border-t border-line">
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
        </div>
      )}
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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
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
      </div>
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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
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
      </div>
    </div>
  )
}
