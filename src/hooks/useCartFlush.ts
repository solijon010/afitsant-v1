import { useEffect, useRef } from 'react'
import { useCart } from '@/stores/cart'

const BATCH_SIZE = 5
const DEBOUNCE_MS = 10_000

/**
 * Buyurtma savatidan SQLite + serverga avtomatik flush.
 * 5 ta o'zgarish to'planganda yoki 10 soniya o'tsa — SQLite'ga saqlaydi va serverga yuboradi.
 */
export function useCartFlush(): { flushNow: () => Promise<void> } {
  const orderId = useCart((s) => s.orderId)
  const lines = useCart((s) => s.lines)
  const timer = useRef<NodeJS.Timeout | null>(null)
  const inFlight = useRef(false)

  const flushNow = async (): Promise<void> => {
    const state = useCart.getState()
    const oId = state.orderId
    if (!oId || inFlight.current) return
    const pending = state.lines.filter((l) => !l.flushed && l.quantity > 0)
    if (pending.length === 0) return

    inFlight.current = true
    try {
      // 1. SQLite'ga UPSERT — yangi va o'zgargan itemlar saqlanadi
      const saved = await window.afisant.orders.addItems(
        oId,
        pending.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          notes: l.notes,
          localUuid: l.localUuid
        }))
      )
      useCart.setState({
        lines: useCart.getState().lines.map((l) => {
          const match = saved.find((c) => c.localUuid === l.localUuid)
          return match ? { ...l, flushed: true, itemId: match.id } : l
        })
      })

      // 2. Server sinxroni — faqat online bo'lganda (fon rejimida)
      const roomServerId = useCart.getState().roomServerId
      if (roomServerId && navigator.onLine) {
        const allLines = useCart.getState().lines.filter((l) => l.productServerId && l.quantity > 0)
        // Dublikat productServerId ni birlashtirish
        const serverMap = new Map<string, number>()
        for (const l of allLines) {
          const prev = serverMap.get(l.productServerId!) ?? 0
          serverMap.set(l.productServerId!, prev + Math.round(l.quantity))
        }
        if (serverMap.size > 0) {
          void window.afisant.orders.syncAll({
            localOrderId: oId,
            roomServerId,
            items: Array.from(serverMap.entries()).map(([productServerId, count]) => ({ productServerId, count }))
          }).catch((e: any) => {
            // Server sync xatosi — keyingi background tick da qayta urinadi
            console.warn('[useCartFlush] Server sync failed (will retry):', e?.message)
          })
        }
      }
    } finally {
      inFlight.current = false
    }
  }

  useEffect(() => {
    if (!orderId) return
    const pending = lines.filter((l) => !l.flushed).length

    if (pending >= BATCH_SIZE) {
      if (timer.current) clearTimeout(timer.current)
      void flushNow()
      return
    }

    if (pending > 0) {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void flushNow()
      }, DEBOUNCE_MS)
    }

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, orderId])

  return { flushNow }
}
