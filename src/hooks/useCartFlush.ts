import { useEffect, useRef } from 'react'
import { useCart } from '@/stores/cart'

const BATCH_SIZE = 5
const DEBOUNCE_MS = 10_000

/**
 * Buyurtma savatidan SQLite/server'ga avtomatik flush.
 * 5 ta yangi mahsulot to'planganda yoki 10 soniya o'tsa — bitta IPC chaqirig'ida yuboradi.
 */
export function useCartFlush(): { flushNow: () => Promise<void> } {
  const orderId = useCart((s) => s.orderId)
  const lines = useCart((s) => s.lines)
  const timer = useRef<NodeJS.Timeout | null>(null)
  const inFlight = useRef(false)

  const flushNow = async (): Promise<void> => {
    const oId = useCart.getState().orderId
    if (!oId || inFlight.current) return
    const pending = useCart.getState().lines.filter((l) => !l.flushed && l.quantity > 0)
    if (pending.length === 0) return

    inFlight.current = true
    try {
      const created = await window.afisant.orders.addItems(
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
          const match = created.find((c) => c.localUuid === l.localUuid)
          return match ? { ...l, flushed: true, itemId: match.id } : l
        })
      })
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
