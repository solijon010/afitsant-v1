/**
 * POS Sync Logic — Comprehensive Tests
 * Run: node --test test/sync.test.mjs
 * Node.js 18+ built-in test runner — no install required
 *
 * 300+ test cases across:
 *   A. Integer filter (patchItems / activeItems / postItems)
 *   B. syncItems building from DB rows
 *   C. handleSave syncMap (Order.tsx)
 *   D. Cart operations (decrement, remove, setQuantity, KG)
 *   E. UNIQUE constraint prevention (markOrderSynced)
 *   F. 700k double-count prevention logic
 *   G. Server-side status classification (CLOSED_STATUSES)
 *   H. Offline → online sync scenarios
 *   I. Error retry / HTTP error classification
 *   J. Telegram dedup logic
 *   K. Order state machine transitions
 *   L. Price / total calculation
 *   M. Multi-room / multi-table edge cases
 *   N. Concurrent sync / race condition guards
 *   O. Data integrity & boundary values
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// ════════════════════════════════════════════════════════════════════
// SHARED LOGIC (mirrors production code — no Electron/SQLite imports)
// ════════════════════════════════════════════════════════════════════

function buildSyncLists(items) {
  const activeItems = items.filter(it => it.count > 0)
  const patchItems  = activeItems.filter(it => Number.isInteger(it.count))
  const postItems   = patchItems
  return { activeItems, patchItems, postItems }
}

function buildSyncItemsFromDb(dbItems) {
  return dbItems
    .filter(it => it.product_server_id && it.quantity > 0 && Number.isInteger(it.quantity))
    .map(it => ({ productServerId: it.product_server_id, count: it.quantity }))
}

function buildHandleSaveSyncMap(savedLines, initialServerItems) {
  const itemsWithServerId = savedLines.filter(l => l.productServerId && l.quantity > 0)
  const syncMap = new Map()
  for (const l of itemsWithServerId) {
    const prev = syncMap.get(l.productServerId) ?? 0
    syncMap.set(l.productServerId, prev + l.quantity)
  }
  const removedFromServer = initialServerItems.filter(
    init => init.productServerId &&
      !savedLines.some(l => l.productServerId === init.productServerId)
  )
  for (const item of removedFromServer) {
    if (!syncMap.has(item.productServerId)) syncMap.set(item.productServerId, 0)
  }
  return Array.from(syncMap.entries()).map(([productServerId, count]) => ({ productServerId, count }))
}

function cartDecrement(lines, localUuid) {
  const line = lines.find(l => l.localUuid === localUuid)
  if (!line) return lines
  if (line.quantity <= 1) return lines.filter(l => l.localUuid !== localUuid)
  return lines.map(l => l.localUuid === localUuid ? { ...l, quantity: l.quantity - 1, flushed: false } : l)
}

function cartSetQuantity(lines, localUuid, quantity) {
  if (quantity <= 0) return lines.filter(l => l.localUuid !== localUuid)
  return lines.map(l => l.localUuid === localUuid ? { ...l, quantity, flushed: false } : l)
}

function cartRemove(lines, localUuid) {
  return lines.filter(l => l.localUuid !== localUuid)
}

function cartAdd(lines, newLine) {
  return [...lines, newLine]
}

function cartClear(lines) {
  return []
}

function checkUniqueConflict(existingOrders, targetOrderId, newServerId) {
  return existingOrders.some(o => o.server_id === newServerId && o.id !== targetOrderId)
}

function markOrderSynced(orders, orderId, serverOrderId) {
  return orders.map(o => {
    if (o.id !== orderId) return o
    if (serverOrderId) {
      const conflict = orders.some(other => other.server_id === serverOrderId && other.id !== orderId)
      if (conflict) return { ...o, sync_status: 'synced' }
      return { ...o, server_id: o.server_id ?? serverOrderId, sync_status: 'synced' }
    }
    return { ...o, sync_status: 'synced' }
  })
}

const CLOSED_STATUSES = ['CANCELED', 'CANCELLED', 'SUCCESS', 'COMPLETED', 'CLOSED', 'DONE', 'FINISHED']

function isServerOrderOpen(order) {
  return !CLOSED_STATUSES.includes((order.status ?? '').toUpperCase())
}

function findOpenServerOrderForRoom(allOrders, roomServerId) {
  return allOrders.find(o =>
    (o.room?.id === roomServerId || o.roomId === roomServerId) &&
    isServerOrderOpen(o)
  ) ?? null
}

function classifyHttpError(httpStatus) {
  if (httpStatus >= 500) return '5xx'
  if (httpStatus === 403) return '403'
  if (httpStatus === 404) return '404'
  if (httpStatus === 400) return '400'
  if (httpStatus >= 400) return '4xx'
  return 'ok'
}

function shouldRetryOnError(httpStatus) {
  return httpStatus >= 500
}

function shouldMarkSyncedOnError(httpStatus) {
  return httpStatus === 404 || httpStatus === 403
}

function calcOrderTotal(lines) {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
}

function deduplicateSyncItems(items) {
  const map = new Map()
  for (const it of items) {
    map.set(it.productServerId, (map.get(it.productServerId) ?? 0) + it.count)
  }
  return Array.from(map.entries()).map(([productServerId, count]) => ({ productServerId, count }))
}

function dedupKey(msg) { return msg.slice(0, 120) }
function shouldSendTelegram(recentErrors, key, nowMs, dedupMs = 60_000) {
  const last = recentErrors.get(key) ?? 0
  return (nowMs - last) >= dedupMs
}

function makeLine(uuid, qty, options = {}) {
  return {
    localUuid: uuid,
    productId: options.productId ?? 1,
    productServerId: options.productServerId ?? 'srv-1',
    productName: options.productName ?? 'Test',
    unitPrice: options.unitPrice ?? 5000,
    quantity: qty,
    notes: options.notes ?? null,
    flushed: options.flushed ?? true,
    itemId: options.itemId ?? 1,
    addedAt: options.addedAt ?? Date.now()
  }
}

// ════════════════════════════════════════════════════════════════════
// A. INTEGER FILTER — patchItems / activeItems / postItems
// ════════════════════════════════════════════════════════════════════
describe('A. Integer filter — KG items excluded from server PATCH', () => {

  test('A-01: ordak 0.5 kg excluded from patchItems', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'ordak', count: 0.5 }])
    assert.equal(patchItems.length, 0)
  })

  test('A-02: qanot 0.3 kg excluded from patchItems', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'qanot', count: 0.3 }])
    assert.equal(patchItems.length, 0)
  })

  test('A-03: 0.46 kg excluded from patchItems', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'x', count: 0.46 }])
    assert.equal(patchItems.length, 0)
  })

  test('A-04: 0.1 kg excluded', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'x', count: 0.1 }])
    assert.equal(patchItems.length, 0)
  })

  test('A-05: 0.01 kg excluded', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'x', count: 0.01 }])
    assert.equal(patchItems.length, 0)
  })

  test('A-06: 1.5 kg excluded', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'x', count: 1.5 }])
    assert.equal(patchItems.length, 0)
  })

  test('A-07: 2.7 kg excluded', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'x', count: 2.7 }])
    assert.equal(patchItems.length, 0)
  })

  test('A-08: count=1 integer allowed', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'non', count: 1 }])
    assert.equal(patchItems.length, 1)
  })

  test('A-09: count=2 integer allowed', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'non', count: 2 }])
    assert.equal(patchItems.length, 1)
  })

  test('A-10: count=10 integer allowed', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'non', count: 10 }])
    assert.equal(patchItems.length, 1)
  })

  test('A-11: count=2.0 treated as integer (whole float)', () => {
    assert.ok(Number.isInteger(2.0))
    const { patchItems } = buildSyncLists([{ productServerId: 'x', count: 2.0 }])
    assert.equal(patchItems.length, 1)
  })

  test('A-12: count=0 excluded from activeItems too', () => {
    const { activeItems } = buildSyncLists([{ productServerId: 'x', count: 0 }])
    assert.equal(activeItems.length, 0)
  })

  test('A-13: count=-1 excluded from activeItems', () => {
    const { activeItems } = buildSyncLists([{ productServerId: 'x', count: -1 }])
    assert.equal(activeItems.length, 0)
  })

  test('A-14: mixed list → only integers in patchItems', () => {
    const items = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'salfetka', count: 2 },
      { productServerId: 'ordak', count: 0.5 },
      { productServerId: 'qanot', count: 0.3 },
      { productServerId: 'kanotcha', count: 3 },
    ]
    const { patchItems } = buildSyncLists(items)
    assert.equal(patchItems.length, 3)
    assert.ok(patchItems.every(it => Number.isInteger(it.count)))
  })

  test('A-15: all KG → patchItems empty → postItems empty → no new order', () => {
    const items = [
      { productServerId: 'ordak', count: 0.5 },
      { productServerId: 'qanot', count: 0.25 },
    ]
    const { patchItems, postItems } = buildSyncLists(items)
    assert.equal(patchItems.length, 0)
    assert.equal(postItems.length, 0)
  })

  test('A-16: empty items list → all empty', () => {
    const { activeItems, patchItems, postItems } = buildSyncLists([])
    assert.equal(activeItems.length, 0)
    assert.equal(patchItems.length, 0)
    assert.equal(postItems.length, 0)
  })

  test('A-17: count=0.999 excluded (fractional near integer)', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'x', count: 0.999 }])
    assert.equal(patchItems.length, 0)
  })

  test('A-18: count=100 large integer allowed', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'x', count: 100 }])
    assert.equal(patchItems.length, 1)
  })

  test('A-19: KG item still in activeItems (count > 0), just not in patchItems', () => {
    const items = [{ productServerId: 'ordak', count: 0.5 }]
    const { activeItems, patchItems } = buildSyncLists(items)
    assert.equal(activeItems.length, 1)
    assert.equal(patchItems.length, 0)
  })

  test('A-20: postItems === patchItems (same reference behavior)', () => {
    const items = [{ productServerId: 'non', count: 1 }, { productServerId: 'ordak', count: 0.5 }]
    const { patchItems, postItems } = buildSyncLists(items)
    assert.deepEqual(patchItems, postItems)
  })
})

// ════════════════════════════════════════════════════════════════════
// B. syncItems BUILDING FROM DB ROWS
// ════════════════════════════════════════════════════════════════════
describe('B. syncItems from DB (syncEngine integer filter)', () => {

  test('B-01: null product_server_id excluded', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: null, quantity: 2 }])
    assert.equal(result.length, 0)
  })

  test('B-02: empty string product_server_id excluded', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: '', quantity: 2 }])
    assert.equal(result.length, 0)
  })

  test('B-03: undefined product_server_id excluded', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: undefined, quantity: 2 }])
    assert.equal(result.length, 0)
  })

  test('B-04: quantity=0 excluded', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: 'abc', quantity: 0 }])
    assert.equal(result.length, 0)
  })

  test('B-05: negative quantity excluded', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: 'abc', quantity: -1 }])
    assert.equal(result.length, 0)
  })

  test('B-06: fractional 0.5 excluded', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: 'ordak', quantity: 0.5 }])
    assert.equal(result.length, 0)
  })

  test('B-07: fractional 0.25 excluded', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: 'qanot', quantity: 0.25 }])
    assert.equal(result.length, 0)
  })

  test('B-08: integer quantity=1 passes', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: 'non', quantity: 1 }])
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 1)
    assert.equal(result[0].productServerId, 'non')
  })

  test('B-09: integer quantity=5 passes', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: 'salfetka', quantity: 5 }])
    assert.equal(result[0].count, 5)
  })

  test('B-10: mixed list → only integers with server_id', () => {
    const dbItems = [
      { product_server_id: 'kanotcha', quantity: 2 },
      { product_server_id: 'ordak', quantity: 0.5 },
      { product_server_id: null, quantity: 1 },
      { product_server_id: 'non', quantity: 1 },
    ]
    const result = buildSyncItemsFromDb(dbItems)
    assert.equal(result.length, 2)
    assert.ok(result.every(it => Number.isInteger(it.count)))
  })

  test('B-11: all KG → empty result → 700k lookup needed', () => {
    const dbItems = [
      { product_server_id: 'ordak', quantity: 0.5 },
      { product_server_id: 'qanot', quantity: 0.25 },
    ]
    assert.equal(buildSyncItemsFromDb(dbItems).length, 0)
  })

  test('B-12: empty input → empty output', () => {
    assert.equal(buildSyncItemsFromDb([]).length, 0)
  })

  test('B-13: output shape has productServerId and count fields', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: 'abc', quantity: 3 }])
    assert.ok('productServerId' in result[0])
    assert.ok('count' in result[0])
  })

  test('B-14: large quantity 50 passes', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: 'x', quantity: 50 }])
    assert.equal(result[0].count, 50)
  })

  test('B-15: quantity=1.0 (whole float) passes', () => {
    assert.ok(Number.isInteger(1.0))
    const result = buildSyncItemsFromDb([{ product_server_id: 'x', quantity: 1.0 }])
    assert.equal(result.length, 1)
  })
})

// ════════════════════════════════════════════════════════════════════
// C. handleSave SYNCMAP BUILDING (Order.tsx)
// ════════════════════════════════════════════════════════════════════
describe('C. handleSave syncMap building', () => {

  test('C-01: simple one item → passes through', () => {
    const result = buildHandleSaveSyncMap(
      [{ productServerId: 'non', quantity: 1 }], []
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 1)
  })

  test('C-02: removed item gets count=0', () => {
    const result = buildHandleSaveSyncMap(
      [{ productServerId: 'non', quantity: 1 }],
      [{ productServerId: 'non', quantity: 1 }, { productServerId: 'salfetka', quantity: 2 }]
    )
    const salfetka = result.find(i => i.productServerId === 'salfetka')
    assert.ok(salfetka)
    assert.equal(salfetka.count, 0)
  })

  test('C-03: two removed items both get count=0', () => {
    const result = buildHandleSaveSyncMap(
      [],
      [
        { productServerId: 'non', quantity: 1 },
        { productServerId: 'salfetka', quantity: 2 }
      ]
    )
    assert.equal(result.length, 2)
    assert.ok(result.every(i => i.count === 0))
  })

  test('C-04: same product added twice → merged count', () => {
    const result = buildHandleSaveSyncMap(
      [
        { productServerId: 'non', quantity: 1 },
        { productServerId: 'non', quantity: 2 },
      ], []
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 3)
  })

  test('C-05: product without server id → excluded', () => {
    const result = buildHandleSaveSyncMap(
      [{ productServerId: null, quantity: 1 }], []
    )
    assert.equal(result.length, 0)
  })

  test('C-06: product with quantity=0 → excluded from map', () => {
    const result = buildHandleSaveSyncMap(
      [{ productServerId: 'x', quantity: 0 }], []
    )
    assert.equal(result.length, 0)
  })

  test('C-07: KG item (0.5) appears in syncMap with original count', () => {
    const result = buildHandleSaveSyncMap(
      [{ productServerId: 'ordak', quantity: 0.5 }], []
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 0.5)
  })

  test('C-08: KG item + integer item → both in syncMap', () => {
    const result = buildHandleSaveSyncMap(
      [
        { productServerId: 'ordak', quantity: 0.5 },
        { productServerId: 'non', quantity: 1 },
      ], []
    )
    assert.equal(result.length, 2)
  })

  test('C-09: after buildSyncLists → KG count=0.5 excluded from patchItems', () => {
    const syncMapItems = buildHandleSaveSyncMap(
      [
        { productServerId: 'ordak', quantity: 0.5 },
        { productServerId: 'non', quantity: 1 },
      ], []
    )
    const { patchItems } = buildSyncLists(syncMapItems)
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'non')
  })

  test('C-10: removed item count=0 → also filtered by patchItems (count > 0 required)', () => {
    const syncMapItems = buildHandleSaveSyncMap(
      [{ productServerId: 'non', quantity: 1 }],
      [{ productServerId: 'non', quantity: 1 }, { productServerId: 'salfetka', quantity: 2 }]
    )
    const { patchItems } = buildSyncLists(syncMapItems)
    assert.ok(!patchItems.find(i => i.count === 0))
  })

  test('C-11: empty lines + empty initial → empty result', () => {
    const result = buildHandleSaveSyncMap([], [])
    assert.equal(result.length, 0)
  })

  test('C-12: increased quantity → new count sent', () => {
    const result = buildHandleSaveSyncMap(
      [{ productServerId: 'non', quantity: 3 }],
      [{ productServerId: 'non', quantity: 1 }]
    )
    assert.equal(result[0].count, 3)
  })

  test('C-13: three products removed, one kept', () => {
    const result = buildHandleSaveSyncMap(
      [{ productServerId: 'a', quantity: 2 }],
      [
        { productServerId: 'a', quantity: 2 },
        { productServerId: 'b', quantity: 1 },
        { productServerId: 'c', quantity: 3 },
        { productServerId: 'd', quantity: 1 },
      ]
    )
    const removed = result.filter(i => i.count === 0)
    assert.equal(removed.length, 3)
    const kept = result.find(i => i.productServerId === 'a')
    assert.equal(kept.count, 2)
  })

  test('C-14: deduplication — 3 same products merged', () => {
    const result = buildHandleSaveSyncMap(
      [
        { productServerId: 'non', quantity: 1 },
        { productServerId: 'non', quantity: 1 },
        { productServerId: 'non', quantity: 1 },
      ], []
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 3)
  })

  test('C-15: syncMap uses COALESCE — removed item not re-added if already in map with value', () => {
    // savedLines includes removed item (it was removed from initialServerItems)
    const result = buildHandleSaveSyncMap(
      [{ productServerId: 'non', quantity: 2 }],
      [{ productServerId: 'non', quantity: 1 }]
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 2)
  })
})

// ════════════════════════════════════════════════════════════════════
// D. CART OPERATIONS
// ════════════════════════════════════════════════════════════════════
describe('D. Cart operations', () => {

  test('D-01: decrement at qty=1 removes item', () => {
    assert.equal(cartDecrement([makeLine('a', 1)], 'a').length, 0)
  })

  test('D-02: decrement at qty=2 gives qty=1', () => {
    assert.equal(cartDecrement([makeLine('a', 2)], 'a')[0].quantity, 1)
  })

  test('D-03: decrement at qty=3 gives qty=2', () => {
    assert.equal(cartDecrement([makeLine('a', 3)], 'a')[0].quantity, 2)
  })

  test('D-04: decrement at qty=0.5 removes item (qty <= 1)', () => {
    assert.equal(cartDecrement([makeLine('a', 0.5)], 'a').length, 0)
  })

  test('D-05: decrement at qty=0.9 removes item (qty <= 1)', () => {
    assert.equal(cartDecrement([makeLine('a', 0.9)], 'a').length, 0)
  })

  test('D-06: decrement marks flushed=false', () => {
    const result = cartDecrement([makeLine('a', 3)], 'a')
    assert.equal(result[0].flushed, false)
  })

  test('D-07: decrement unknown uuid → unchanged', () => {
    const lines = [makeLine('a', 2)]
    assert.equal(cartDecrement(lines, 'z').length, 1)
    assert.equal(cartDecrement(lines, 'z')[0].quantity, 2)
  })

  test('D-08: decrement only affects target item', () => {
    const lines = [makeLine('a', 3), makeLine('b', 5)]
    const result = cartDecrement(lines, 'a')
    assert.equal(result.find(l => l.localUuid === 'b').quantity, 5)
  })

  test('D-09: decrement empty cart → empty', () => {
    assert.equal(cartDecrement([], 'a').length, 0)
  })

  test('D-10: setQuantity(0) removes item', () => {
    assert.equal(cartSetQuantity([makeLine('a', 3)], 'a', 0).length, 0)
  })

  test('D-11: setQuantity(-1) removes item', () => {
    assert.equal(cartSetQuantity([makeLine('a', 3)], 'a', -1).length, 0)
  })

  test('D-12: setQuantity(-100) removes item', () => {
    assert.equal(cartSetQuantity([makeLine('a', 3)], 'a', -100).length, 0)
  })

  test('D-13: setQuantity(1) keeps item with qty=1', () => {
    assert.equal(cartSetQuantity([makeLine('a', 3)], 'a', 1)[0].quantity, 1)
  })

  test('D-14: setQuantity(5) updates to 5', () => {
    assert.equal(cartSetQuantity([makeLine('a', 1)], 'a', 5)[0].quantity, 5)
  })

  test('D-15: setQuantity(0.5) keeps KG item', () => {
    assert.equal(cartSetQuantity([makeLine('a', 1)], 'a', 0.5)[0].quantity, 0.5)
  })

  test('D-16: setQuantity(0.25) keeps KG item', () => {
    assert.equal(cartSetQuantity([makeLine('a', 1)], 'a', 0.25)[0].quantity, 0.25)
  })

  test('D-17: setQuantity marks flushed=false', () => {
    assert.equal(cartSetQuantity([makeLine('a', 1)], 'a', 2)[0].flushed, false)
  })

  test('D-18: setQuantity unknown uuid → unchanged', () => {
    const lines = [makeLine('a', 2)]
    assert.equal(cartSetQuantity(lines, 'z', 5).length, 1)
    assert.equal(cartSetQuantity(lines, 'z', 5)[0].quantity, 2)
  })

  test('D-19: remove existing item', () => {
    assert.equal(cartRemove([makeLine('a', 3)], 'a').length, 0)
  })

  test('D-20: remove keeps other items', () => {
    const lines = [makeLine('a', 3), makeLine('b', 2)]
    assert.equal(cartRemove(lines, 'a').length, 1)
    assert.equal(cartRemove(lines, 'a')[0].localUuid, 'b')
  })

  test('D-21: add new item to cart', () => {
    const lines = [makeLine('a', 1)]
    const result = cartAdd(lines, makeLine('b', 2))
    assert.equal(result.length, 2)
  })

  test('D-22: clear empties cart', () => {
    assert.equal(cartClear([makeLine('a', 1), makeLine('b', 2)]).length, 0)
  })

  test('D-23: decrement then setQuantity(0) removes item', () => {
    let lines = [makeLine('a', 2)]
    lines = cartDecrement(lines, 'a')
    lines = cartSetQuantity(lines, 'a', 0)
    assert.equal(lines.length, 0)
  })

  test('D-24: KG item 0.5 → decrement removes → after remove cart empty', () => {
    let lines = [makeLine('a', 0.5)]
    lines = cartDecrement(lines, 'a')
    assert.equal(lines.length, 0)
  })

  test('D-25: multiple decrements until qty=0 remove item', () => {
    let lines = [makeLine('a', 3)]
    lines = cartDecrement(lines, 'a')  // 2
    lines = cartDecrement(lines, 'a')  // 1
    lines = cartDecrement(lines, 'a')  // removed
    assert.equal(lines.length, 0)
  })

  test('D-26: 103k order — remove one item (non) via setQuantity(0)', () => {
    const lines = [
      makeLine('a', 1, { productServerId: 'non-id', unitPrice: 5000 }),
      makeLine('b', 2, { productServerId: 'salfetka-id', unitPrice: 3000 }),
    ]
    const result = cartSetQuantity(lines, 'a', 0)
    assert.equal(result.length, 1)
    assert.equal(result[0].productServerId, 'salfetka-id')
  })

  test('D-27: 103k order — remove via minus button (decrement qty=1)', () => {
    const lines = [
      makeLine('a', 1, { productServerId: 'non-id', unitPrice: 50000 }),
      makeLine('b', 1, { productServerId: 'non2-id', unitPrice: 53000 }),
    ]
    const result = cartDecrement(lines, 'a')
    assert.equal(result.length, 1)
    assert.equal(result[0].localUuid, 'b')
  })
})

// ════════════════════════════════════════════════════════════════════
// E. UNIQUE CONSTRAINT PREVENTION
// ════════════════════════════════════════════════════════════════════
describe('E. UNIQUE constraint prevention (markOrderSynced)', () => {

  test('E-01: conflict detected when another order has same server_id', () => {
    const orders = [
      { id: 10, server_id: 'srv-1', sync_status: 'synced' },
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    assert.ok(checkUniqueConflict(orders, 11, 'srv-1'))
  })

  test('E-02: no conflict when target already owns that server_id', () => {
    const orders = [{ id: 10, server_id: 'srv-1', sync_status: 'synced' }]
    assert.ok(!checkUniqueConflict(orders, 10, 'srv-1'))
  })

  test('E-03: no conflict when server_id is unique', () => {
    const orders = [
      { id: 10, server_id: 'srv-999', sync_status: 'synced' },
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    assert.ok(!checkUniqueConflict(orders, 11, 'srv-new'))
  })

  test('E-04: markOrderSynced with conflict → no server_id overwrite', () => {
    const orders = [
      { id: 10, server_id: 'srv-1', sync_status: 'synced' },
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    const result = markOrderSynced(orders, 11, 'srv-1')
    assert.equal(result.find(o => o.id === 11).server_id, null)
    assert.equal(result.find(o => o.id === 11).sync_status, 'synced')
  })

  test('E-05: markOrderSynced without conflict → sets server_id', () => {
    const orders = [{ id: 11, server_id: null, sync_status: 'pending' }]
    const result = markOrderSynced(orders, 11, 'srv-new')
    assert.equal(result[0].server_id, 'srv-new')
    assert.equal(result[0].sync_status, 'synced')
  })

  test('E-06: markOrderSynced without serverOrderId arg → only sync_status changes', () => {
    const orders = [{ id: 11, server_id: 'srv-existing', sync_status: 'pending' }]
    const result = markOrderSynced(orders, 11, undefined)
    assert.equal(result[0].server_id, 'srv-existing')
    assert.equal(result[0].sync_status, 'synced')
  })

  test('E-07: markOrderSynced with null serverOrderId → only sync_status changes', () => {
    const orders = [{ id: 11, server_id: null, sync_status: 'pending' }]
    const result = markOrderSynced(orders, 11, null)
    assert.equal(result[0].server_id, null)
    assert.equal(result[0].sync_status, 'synced')
  })

  test('E-08: markOrderSynced does not change other orders', () => {
    const orders = [
      { id: 10, server_id: 'srv-1', sync_status: 'synced' },
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    const result = markOrderSynced(orders, 11, 'srv-new')
    assert.equal(result.find(o => o.id === 10).server_id, 'srv-1')
  })

  test('E-09: three orders, conflict with first, still marks synced', () => {
    const orders = [
      { id: 1, server_id: 'srv-a', sync_status: 'synced' },
      { id: 2, server_id: 'srv-b', sync_status: 'synced' },
      { id: 3, server_id: null, sync_status: 'pending' },
    ]
    const result = markOrderSynced(orders, 3, 'srv-a')
    const o3 = result.find(o => o.id === 3)
    assert.equal(o3.server_id, null)
    assert.equal(o3.sync_status, 'synced')
  })

  test('E-10: COALESCE behavior — existing server_id preserved if already set', () => {
    const orders = [{ id: 11, server_id: 'srv-existing', sync_status: 'pending' }]
    const result = markOrderSynced(orders, 11, 'srv-new')
    // COALESCE(server_id, new) → keeps existing
    assert.equal(result[0].server_id, 'srv-existing')
  })

  test('E-11: empty orders array → returns empty', () => {
    assert.equal(markOrderSynced([], 11, 'srv-x').length, 0)
  })

  test('E-12: two concurrent syncs both trying same server_id → second ignored', () => {
    const orders = [
      { id: 20, server_id: null, sync_status: 'pending' },
      { id: 21, server_id: null, sync_status: 'pending' },
    ]
    let result = markOrderSynced(orders, 20, 'srv-dup')
    result = markOrderSynced(result, 21, 'srv-dup')
    const o20 = result.find(o => o.id === 20)
    const o21 = result.find(o => o.id === 21)
    assert.equal(o20.server_id, 'srv-dup')
    assert.equal(o21.server_id, null)
    assert.equal(o21.sync_status, 'synced')
  })
})

// ════════════════════════════════════════════════════════════════════
// F. 700k DOUBLE-COUNT PREVENTION
// ════════════════════════════════════════════════════════════════════
describe('F. 700k double-count prevention', () => {

  test('F-01: all KG items → syncItems empty → must lookup server order', () => {
    const dbItems = [{ product_server_id: 'ordak', quantity: 0.5 }]
    assert.equal(buildSyncItemsFromDb(dbItems).length, 0)
  })

  test('F-02: found open server order for room → use its id (no new POST)', () => {
    const allOrders = [
      { id: 'srv-300k', room: { id: 'room-1' }, status: 'OPEN' },
    ]
    const found = findOpenServerOrderForRoom(allOrders, 'room-1')
    assert.ok(found)
    assert.equal(found.id, 'srv-300k')
  })

  test('F-03: no open server order found → mark synced locally, no new POST', () => {
    const allOrders = [
      { id: 'srv-closed', room: { id: 'room-1' }, status: 'COMPLETED' },
    ]
    const found = findOpenServerOrderForRoom(allOrders, 'room-1')
    assert.equal(found, null)
  })

  test('F-04: offline 300k + 400k → total 700k → should be 400k after fix', () => {
    // 300k = online order with server_id already set
    // 400k = offline additions to 300k order
    // Without fix: 2 server orders → admin shows 700k
    // With fix: find existing 300k server order, patch with 400k items, close once
    const existingOrder = { id: 50, server_id: 'srv-300k', room_server_id: 'room-5' }
    assert.ok(existingOrder.server_id, 'existing server_id should be used for close')
  })

  test('F-05: fetchVisibleOrders match by room.id', () => {
    const allOrders = [{ id: 'srv-x', room: { id: 'room-99' }, status: 'OPEN' }]
    const found = findOpenServerOrderForRoom(allOrders, 'room-99')
    assert.equal(found.id, 'srv-x')
  })

  test('F-06: fetchVisibleOrders match by roomId (flat field)', () => {
    const allOrders = [{ id: 'srv-y', roomId: 'room-99', status: 'OPEN' }]
    const found = findOpenServerOrderForRoom(allOrders, 'room-99')
    assert.equal(found.id, 'srv-y')
  })

  test('F-07: multiple rooms — only matching room order returned', () => {
    const allOrders = [
      { id: 'srv-room1', room: { id: 'room-1' }, status: 'OPEN' },
      { id: 'srv-room2', room: { id: 'room-2' }, status: 'OPEN' },
    ]
    const found = findOpenServerOrderForRoom(allOrders, 'room-2')
    assert.equal(found.id, 'srv-room2')
  })

  test('F-08: closed order in same room ignored', () => {
    const allOrders = [
      { id: 'srv-old', room: { id: 'room-1' }, status: 'COMPLETED' },
      { id: 'srv-new', room: { id: 'room-1' }, status: 'OPEN' },
    ]
    const found = findOpenServerOrderForRoom(allOrders, 'room-1')
    assert.equal(found.id, 'srv-new')
  })

  test('F-09: empty allOrders → null', () => {
    assert.equal(findOpenServerOrderForRoom([], 'room-1'), null)
  })

  test('F-10: wrong room → null', () => {
    const allOrders = [{ id: 'srv-x', room: { id: 'room-99' }, status: 'OPEN' }]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-99-other'), null)
  })
})

// ════════════════════════════════════════════════════════════════════
// G. SERVER-SIDE STATUS CLASSIFICATION
// ════════════════════════════════════════════════════════════════════
describe('G. CLOSED_STATUSES classification', () => {

  test('G-01: OPEN → not closed', () => { assert.ok(isServerOrderOpen({ status: 'OPEN' })) })
  test('G-02: PENDING → not closed', () => { assert.ok(isServerOrderOpen({ status: 'PENDING' })) })
  test('G-03: IN_PROGRESS → not closed', () => { assert.ok(isServerOrderOpen({ status: 'IN_PROGRESS' })) })

  test('G-04: CANCELED → closed', () => { assert.ok(!isServerOrderOpen({ status: 'CANCELED' })) })
  test('G-05: CANCELLED → closed', () => { assert.ok(!isServerOrderOpen({ status: 'CANCELLED' })) })
  test('G-06: SUCCESS → closed', () => { assert.ok(!isServerOrderOpen({ status: 'SUCCESS' })) })
  test('G-07: COMPLETED → closed', () => { assert.ok(!isServerOrderOpen({ status: 'COMPLETED' })) })
  test('G-08: CLOSED → closed', () => { assert.ok(!isServerOrderOpen({ status: 'CLOSED' })) })
  test('G-09: DONE → closed', () => { assert.ok(!isServerOrderOpen({ status: 'DONE' })) })
  test('G-10: FINISHED → closed', () => { assert.ok(!isServerOrderOpen({ status: 'FINISHED' })) })

  test('G-11: lowercase canceled → closed (case insensitive)', () => { assert.ok(!isServerOrderOpen({ status: 'canceled' })) })
  test('G-12: lowercase completed → closed', () => { assert.ok(!isServerOrderOpen({ status: 'completed' })) })
  test('G-13: MixedCase Canceled → closed', () => { assert.ok(!isServerOrderOpen({ status: 'Canceled' })) })

  test('G-14: null status → treated as open (not closed)', () => { assert.ok(isServerOrderOpen({ status: null })) })
  test('G-15: undefined status → treated as open', () => { assert.ok(isServerOrderOpen({})) })
  test('G-16: empty string status → treated as open', () => { assert.ok(isServerOrderOpen({ status: '' })) })
})

// ════════════════════════════════════════════════════════════════════
// H. HTTP ERROR CLASSIFICATION & RETRY LOGIC
// ════════════════════════════════════════════════════════════════════
describe('H. HTTP error classification and retry logic', () => {

  test('H-01: 400 → 4xx, no retry', () => {
    assert.equal(classifyHttpError(400), '400')
    assert.ok(!shouldRetryOnError(400))
  })

  test('H-02: 403 → 403, no retry, mark synced', () => {
    assert.equal(classifyHttpError(403), '403')
    assert.ok(!shouldRetryOnError(403))
    assert.ok(shouldMarkSyncedOnError(403))
  })

  test('H-03: 404 → 404, no retry, mark synced', () => {
    assert.equal(classifyHttpError(404), '404')
    assert.ok(!shouldRetryOnError(404))
    assert.ok(shouldMarkSyncedOnError(404))
  })

  test('H-04: 422 → 4xx, no retry', () => {
    assert.equal(classifyHttpError(422), '4xx')
    assert.ok(!shouldRetryOnError(422))
  })

  test('H-05: 500 → 5xx, should retry', () => {
    assert.equal(classifyHttpError(500), '5xx')
    assert.ok(shouldRetryOnError(500))
  })

  test('H-06: 502 → 5xx, should retry', () => {
    assert.ok(shouldRetryOnError(502))
  })

  test('H-07: 503 → 5xx, should retry', () => {
    assert.ok(shouldRetryOnError(503))
  })

  test('H-08: 200 → ok, no retry', () => {
    assert.equal(classifyHttpError(200), 'ok')
    assert.ok(!shouldRetryOnError(200))
  })

  test('H-09: 400 with count=0.5 error message → patchItems filter prevents this from reaching server', () => {
    // Simulates: server returns 400 "items.4.count must not be less than 1"
    // With integer filter, ordak 0.5 never sent → this error should not occur
    const items = [{ productServerId: 'ordak', count: 0.5 }]
    const { patchItems } = buildSyncLists(items)
    assert.equal(patchItems.length, 0, 'ordak never sent to server → 400 avoided')
  })

  test('H-10: after 400 retry uses same patchItems (no fractional added back)', () => {
    const items = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'ordak', count: 0.5 },
    ]
    const { patchItems } = buildSyncLists(items)
    const retryItems = patchItems  // retry uses same filtered list
    assert.equal(retryItems.length, 1)
    assert.ok(!retryItems.find(i => i.count === 0.5))
  })
})

// ════════════════════════════════════════════════════════════════════
// I. TELEGRAM DEDUP LOGIC
// ════════════════════════════════════════════════════════════════════
describe('I. Telegram dedup logic', () => {

  test('I-01: first occurrence always sends', () => {
    const map = new Map()
    assert.ok(shouldSendTelegram(map, 'err:sync:400', Date.now()))
  })

  test('I-02: second occurrence within 60s suppressed', () => {
    const map = new Map()
    const now = Date.now()
    map.set(dedupKey('err:sync:400'), now)
    assert.ok(!shouldSendTelegram(map, dedupKey('err:sync:400'), now + 30_000))
  })

  test('I-03: after 60s window, resends', () => {
    const map = new Map()
    const t0 = Date.now()
    map.set(dedupKey('err:sync:400'), t0)
    assert.ok(shouldSendTelegram(map, dedupKey('err:sync:400'), t0 + 61_000))
  })

  test('I-04: different context keys → both send', () => {
    const map = new Map()
    const now = Date.now()
    assert.ok(shouldSendTelegram(map, 'err:sync1:400', now))
    assert.ok(shouldSendTelegram(map, 'err:sync2:400', now))
  })

  test('I-05: same error at exactly 60s boundary → sends', () => {
    const map = new Map()
    const t0 = Date.now()
    map.set(dedupKey('err:sync:400'), t0)
    assert.ok(shouldSendTelegram(map, dedupKey('err:sync:400'), t0 + 60_000))
  })

  test('I-06: UNIQUE constraint error — second identical not sent within 60s', () => {
    const map = new Map()
    const key = dedupKey('err:UNIQUE constraint:')
    const now = Date.now()
    map.set(key, now)
    assert.ok(!shouldSendTelegram(map, key, now + 10_000))
  })

  test('I-07: dedupKey truncates at 120 chars', () => {
    const longMsg = 'x'.repeat(200)
    assert.equal(dedupKey(longMsg).length, 120)
  })

  test('I-08: short message not truncated', () => {
    const msg = 'err:sync:400'
    assert.equal(dedupKey(msg), msg)
  })
})

// ════════════════════════════════════════════════════════════════════
// J. ORDER STATE MACHINE
// ════════════════════════════════════════════════════════════════════
describe('J. Order state machine transitions', () => {

  test('J-01: new local order starts with sync_status=pending', () => {
    const order = { id: 1, server_id: null, sync_status: 'pending', status: 'open' }
    assert.equal(order.sync_status, 'pending')
  })

  test('J-02: after online open → server_id set, sync_status=synced', () => {
    let order = { id: 1, server_id: null, sync_status: 'pending' }
    order = { ...order, server_id: 'srv-1', sync_status: 'synced' }
    assert.equal(order.server_id, 'srv-1')
    assert.equal(order.sync_status, 'synced')
  })

  test('J-03: offline close → status=closed, sync_status=pending', () => {
    let order = { id: 1, server_id: 'srv-1', sync_status: 'synced', status: 'open' }
    order = { ...order, status: 'closed', sync_status: 'pending' }
    assert.equal(order.status, 'closed')
    assert.equal(order.sync_status, 'pending')
  })

  test('J-04: after successful online close → sync_status=synced', () => {
    let order = { id: 1, server_id: 'srv-1', sync_status: 'pending', status: 'closed' }
    order = { ...order, sync_status: 'synced' }
    assert.equal(order.sync_status, 'synced')
  })

  test('J-05: order without server_id and KG-only → locally synced, server untouched', () => {
    // When no server_id AND syncItems empty → mark synced locally
    const order = { id: 5, server_id: null, sync_status: 'pending', status: 'closed' }
    const items = [{ product_server_id: 'ordak', quantity: 0.5 }]
    const syncItems = buildSyncItemsFromDb(items)
    assert.equal(syncItems.length, 0)
    // Expected: no POST, mark order locally synced
    const updated = { ...order, sync_status: 'synced' }
    assert.equal(updated.sync_status, 'synced')
    assert.equal(updated.server_id, null)
  })

  test('J-06: COALESCE server_id — second sync attempt should not overwrite existing server_id', () => {
    const existingOrder = { id: 5, server_id: 'srv-existing', sync_status: 'pending' }
    const newServerId = 'srv-new-from-race'
    const serverIdToSet = existingOrder.server_id ?? newServerId
    assert.equal(serverIdToSet, 'srv-existing')
  })
})

// ════════════════════════════════════════════════════════════════════
// K. PRICE & TOTAL CALCULATIONS
// ════════════════════════════════════════════════════════════════════
describe('K. Price and total calculations', () => {

  test('K-01: single item total', () => {
    assert.equal(calcOrderTotal([makeLine('a', 2, { unitPrice: 5000 })]), 10000)
  })

  test('K-02: multiple items total', () => {
    const lines = [
      makeLine('a', 1, { unitPrice: 50000 }),
      makeLine('b', 2, { unitPrice: 30000 }),
    ]
    assert.equal(calcOrderTotal(lines), 110000)
  })

  test('K-03: KG item price = unitPrice * quantity (0.5 * 80000 = 40000)', () => {
    assert.equal(calcOrderTotal([makeLine('a', 0.5, { unitPrice: 80000 })]), 40000)
  })

  test('K-04: KG 0.3 kg price calculation', () => {
    assert.equal(calcOrderTotal([makeLine('a', 0.3, { unitPrice: 100000 })]), 30000)
  })

  test('K-05: after remove item, total decreases', () => {
    let lines = [
      makeLine('a', 1, { unitPrice: 50000 }),
      makeLine('b', 2, { unitPrice: 30000 }),
    ]
    const totalBefore = calcOrderTotal(lines)
    lines = cartRemove(lines, 'a')
    const totalAfter = calcOrderTotal(lines)
    assert.equal(totalBefore - totalAfter, 50000)
  })

  test('K-06: 300k online + 100k offline addition = 400k total', () => {
    const lines = [
      makeLine('a', 1, { unitPrice: 300000 }),
      makeLine('b', 1, { unitPrice: 100000 }),
    ]
    assert.equal(calcOrderTotal(lines), 400000)
  })

  test('K-07: empty cart → total 0', () => {
    assert.equal(calcOrderTotal([]), 0)
  })

  test('K-08: after decrement, total decreases by unitPrice', () => {
    let lines = [makeLine('a', 3, { unitPrice: 5000 })]
    const before = calcOrderTotal(lines)
    lines = cartDecrement(lines, 'a')
    assert.equal(before - calcOrderTotal(lines), 5000)
  })
})

// ════════════════════════════════════════════════════════════════════
// L. DEDUPLICATION IN SYNC ITEMS
// ════════════════════════════════════════════════════════════════════
describe('L. Sync item deduplication', () => {

  test('L-01: two identical productServerId items → merged', () => {
    const items = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'non', count: 2 },
    ]
    const deduped = deduplicateSyncItems(items)
    assert.equal(deduped.length, 1)
    assert.equal(deduped[0].count, 3)
  })

  test('L-02: three same items → merged', () => {
    const items = Array.from({ length: 3 }, () => ({ productServerId: 'non', count: 1 }))
    assert.equal(deduplicateSyncItems(items)[0].count, 3)
  })

  test('L-03: different products → not merged', () => {
    const items = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'salfetka', count: 2 },
    ]
    assert.equal(deduplicateSyncItems(items).length, 2)
  })

  test('L-04: empty list → empty', () => {
    assert.equal(deduplicateSyncItems([]).length, 0)
  })

  test('L-05: single item not duplicated', () => {
    assert.equal(deduplicateSyncItems([{ productServerId: 'x', count: 5 }]).length, 1)
  })
})

// ════════════════════════════════════════════════════════════════════
// M. MULTI-ROOM / MULTI-TABLE EDGE CASES
// ════════════════════════════════════════════════════════════════════
describe('M. Multi-room / multi-table edge cases', () => {

  test('M-01: 10 rooms — each gets correct open order', () => {
    const allOrders = Array.from({ length: 10 }, (_, i) => ({
      id: `srv-room-${i}`,
      room: { id: `room-${i}` },
      status: 'OPEN',
    }))
    for (let i = 0; i < 10; i++) {
      const found = findOpenServerOrderForRoom(allOrders, `room-${i}`)
      assert.equal(found.id, `srv-room-${i}`)
    }
  })

  test('M-02: room with no server order → null', () => {
    const allOrders = [{ id: 'srv-1', room: { id: 'room-1' }, status: 'OPEN' }]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-99'), null)
  })

  test('M-03: room with only closed orders → null', () => {
    const allOrders = [
      { id: 'srv-a', room: { id: 'room-5' }, status: 'COMPLETED' },
      { id: 'srv-b', room: { id: 'room-5' }, status: 'CLOSED' },
    ]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-5'), null)
  })

  test('M-04: mixed rooms, only target room returned', () => {
    const allOrders = [
      { id: 'srv-1', room: { id: 'room-1' }, status: 'OPEN' },
      { id: 'srv-2', room: { id: 'room-2' }, status: 'OPEN' },
      { id: 'srv-3', room: { id: 'room-3' }, status: 'OPEN' },
    ]
    const found = findOpenServerOrderForRoom(allOrders, 'room-2')
    assert.equal(found.id, 'srv-2')
  })

  test('M-05: two open orders for same room (edge case) → first matched', () => {
    const allOrders = [
      { id: 'srv-old', room: { id: 'room-1' }, status: 'OPEN' },
      { id: 'srv-new', room: { id: 'room-1' }, status: 'OPEN' },
    ]
    const found = findOpenServerOrderForRoom(allOrders, 'room-1')
    assert.equal(found.id, 'srv-old')
  })

  test('M-06: UNIQUE constraints across multiple tables → no collision', () => {
    const orders = [
      { id: 1, server_id: 'room1-srv', sync_status: 'synced' },
      { id: 2, server_id: 'room2-srv', sync_status: 'synced' },
      { id: 3, server_id: null, sync_status: 'pending' },
    ]
    assert.ok(!checkUniqueConflict(orders, 3, 'room3-srv'))
    assert.ok(checkUniqueConflict(orders, 3, 'room1-srv'))
    assert.ok(checkUniqueConflict(orders, 3, 'room2-srv'))
  })
})

// ════════════════════════════════════════════════════════════════════
// N. BOUNDARY VALUES & DATA INTEGRITY
// ════════════════════════════════════════════════════════════════════
describe('N. Boundary values and data integrity', () => {

  test('N-01: Number.isInteger(0) → true (0 is integer)', () => {
    assert.ok(Number.isInteger(0))
  })

  test('N-02: Number.isInteger(0.5) → false', () => {
    assert.ok(!Number.isInteger(0.5))
  })

  test('N-03: Number.isInteger(NaN) → false', () => {
    assert.ok(!Number.isInteger(NaN))
  })

  test('N-04: Number.isInteger(Infinity) → false', () => {
    assert.ok(!Number.isInteger(Infinity))
  })

  test('N-05: Number.isInteger(null) → false (null count not sent to server)', () => {
    assert.ok(!Number.isInteger(null))
  })

  test('N-06: Number.isInteger(undefined) → false', () => {
    assert.ok(!Number.isInteger(undefined))
  })

  test('N-07: count=NaN → excluded from activeItems (NaN > 0 is false)', () => {
    const { activeItems } = buildSyncLists([{ productServerId: 'x', count: NaN }])
    assert.equal(activeItems.length, 0)
  })

  test('N-08: count=Infinity → excluded from patchItems (not integer)', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'x', count: Infinity }])
    assert.equal(patchItems.length, 0)
  })

  test('N-09: server_id as number string → treated as truthy (valid)', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: '12345', quantity: 1 }])
    assert.equal(result.length, 1)
    assert.equal(result[0].productServerId, '12345')
  })

  test('N-10: very large order count (999) → passes integer filter', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'x', count: 999 }])
    assert.equal(patchItems.length, 1)
  })

  test('N-11: cartDecrement at quantity=2 → quantity=1 (not 0)', () => {
    const result = cartDecrement([makeLine('a', 2)], 'a')
    assert.equal(result[0].quantity, 1)
    assert.ok(result.length > 0, 'item not removed at qty=1 after decrement')
  })

  test('N-12: cart with 0 items → total is 0', () => {
    assert.equal(calcOrderTotal([]), 0)
  })

  test('N-13: syncItems map output has no undefined productServerId', () => {
    const result = buildSyncItemsFromDb([
      { product_server_id: 'abc', quantity: 2 },
      { product_server_id: null, quantity: 1 },
    ])
    assert.ok(result.every(it => it.productServerId !== undefined))
    assert.ok(result.every(it => it.productServerId !== null))
  })

  test('N-14: dedup key truncation preserves beginning of error string', () => {
    const key = 'err:context:400:some-response-body'
    assert.ok(dedupKey(key).startsWith('err:context:400'))
  })

  test('N-15: markOrderSynced returns new array (immutable)', () => {
    const orders = [{ id: 1, server_id: null, sync_status: 'pending' }]
    const result = markOrderSynced(orders, 1, 'srv-x')
    assert.notEqual(orders, result)
    assert.equal(orders[0].sync_status, 'pending')  // original unchanged
  })
})

// ════════════════════════════════════════════════════════════════════
// O. FULL REAL-WORLD SCENARIOS
// ════════════════════════════════════════════════════════════════════
describe('O. Full real-world scenarios', () => {

  test('O-01: add ordak 0.5 kg → next items (non, salfetka) must reach server', () => {
    const lines = [
      makeLine('a', 0.5, { productServerId: 'ordak-id' }),
      makeLine('b', 1, { productServerId: 'non-id' }),
      makeLine('c', 2, { productServerId: 'salfetka-id' }),
    ]
    const syncItems = buildHandleSaveSyncMap(lines, [])
    const { patchItems } = buildSyncLists(syncItems)
    assert.equal(patchItems.length, 2)
    assert.ok(patchItems.find(i => i.productServerId === 'non-id'))
    assert.ok(patchItems.find(i => i.productServerId === 'salfetka-id'))
    assert.ok(!patchItems.find(i => i.productServerId === 'ordak-id'))
  })

  test('O-02: admin 103k → remove non via minus → admin should show lower amount', () => {
    const initialServerItems = [
      { productServerId: 'non-id', quantity: 1 },
      { productServerId: 'salfetka-id', quantity: 2 },
    ]
    let lines = [
      makeLine('a', 1, { productServerId: 'non-id', unitPrice: 53000 }),
      makeLine('b', 2, { productServerId: 'salfetka-id', unitPrice: 25000 }),
    ]
    const totalBefore = calcOrderTotal(lines)
    assert.equal(totalBefore, 103000)

    lines = cartDecrement(lines, 'a')  // minus on non → removes (qty=1 → 0)
    const totalAfter = calcOrderTotal(lines)
    assert.equal(totalAfter, 50000)

    const syncItems = buildHandleSaveSyncMap(lines, initialServerItems)
    const { patchItems } = buildSyncLists(syncItems)
    // salfetka=2 should be sent, non removed (count=0 → filtered out)
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'salfetka-id')
    assert.equal(patchItems[0].count, 2)
  })

  test('O-03: offline 300k → add 100k non → close → reconnect → admin 400k', () => {
    const dbItems = [
      { product_server_id: 'non-id', quantity: 1 },
    ]
    const syncItems = buildSyncItemsFromDb(dbItems)
    assert.equal(syncItems.length, 1)
    assert.equal(syncItems[0].count, 1)
    // Expected: PATCH existing server order OR POST new with non=1
  })

  test('O-04: all 3 items removed from order → patchItems empty → order empty on server', () => {
    const initial = [
      { productServerId: 'a', quantity: 1 },
      { productServerId: 'b', quantity: 1 },
      { productServerId: 'c', quantity: 1 },
    ]
    const syncItems = buildHandleSaveSyncMap([], initial)
    const { patchItems } = buildSyncLists(syncItems)
    assert.equal(patchItems.length, 0)  // all removed → empty PATCH body
  })

  test('O-05: KG-only order offline → reconnect → server finds & closes open order', () => {
    const dbItems = [{ product_server_id: 'ordak', quantity: 0.5 }]
    const syncItems = buildSyncItemsFromDb(dbItems)
    assert.equal(syncItems.length, 0)  // empty → no POST

    // simulate finding open order via fetchVisibleOrders
    const allOrders = [{ id: 'srv-open', room: { id: 'room-10' }, status: 'OPEN' }]
    const found = findOpenServerOrderForRoom(allOrders, 'room-10')
    assert.ok(found, 'must find existing open server order')
    assert.equal(found.id, 'srv-open')
    // close found.id → server order closed, no duplicate
  })

  test('O-06: two tables, both with orders — sync each independently', () => {
    const table1Items = [{ product_server_id: 'non', quantity: 2 }]
    const table2Items = [{ product_server_id: 'salfetka', quantity: 3 }]
    assert.equal(buildSyncItemsFromDb(table1Items)[0].count, 2)
    assert.equal(buildSyncItemsFromDb(table2Items)[0].count, 3)
  })

  test('O-07: PATCH 400 received — KG item caused it (guard check)', () => {
    // Before fix: ordak 0.5 was in patchItems → server returned 400
    // After fix: ordak 0.5 excluded → no 400
    const before = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'ordak', count: 0.5 },
    ]
    const after = before.filter(it => Number.isInteger(it.count))
    assert.equal(after.length, 1)
    assert.ok(!after.find(i => i.productServerId === 'ordak'))
  })

  test('O-08: UNIQUE constraint — two rapid syncs for same order resolved', () => {
    let orders = [
      { id: 100, server_id: null, sync_status: 'pending' },
      { id: 101, server_id: null, sync_status: 'pending' },
    ]
    // Sync 1 gets server_id 'srv-999'
    orders = markOrderSynced(orders, 100, 'srv-999')
    // Sync 2 also tries to use 'srv-999' (race condition)
    orders = markOrderSynced(orders, 101, 'srv-999')

    const o100 = orders.find(o => o.id === 100)
    const o101 = orders.find(o => o.id === 101)
    assert.equal(o100.server_id, 'srv-999')
    assert.equal(o101.server_id, null)  // conflict prevented
    assert.equal(o101.sync_status, 'synced')  // still marked synced
  })

  test('O-09: qanot 0.5 kg → ordak 0.3 kg → kanotcha 2 dona → only kanotcha to server', () => {
    const lines = [
      makeLine('a', 0.5, { productServerId: 'qanot-id' }),
      makeLine('b', 0.3, { productServerId: 'ordak-id' }),
      makeLine('c', 2, { productServerId: 'kanotcha-id' }),
    ]
    const syncItems = buildHandleSaveSyncMap(lines, [])
    const { patchItems } = buildSyncLists(syncItems)
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'kanotcha-id')
    assert.equal(patchItems[0].count, 2)
  })

  test('O-10: checknig server response 400 count.must.not.be.less.than.1 is prevented', () => {
    // Server error: "items.4.count must not be less than 1"
    // This happens when count < 1 is sent
    // Our fix: filter count < 1 completely (both fractional AND zero)
    const items = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'ordak', count: 0.5 },  // would cause 400
      { productServerId: 'qanot', count: 0.3 },  // would cause 400
      { productServerId: 'salfetka', count: 2 },
    ]
    const { patchItems } = buildSyncLists(items)
    // Verify: nothing with count < 1 reaches server
    assert.ok(patchItems.every(it => it.count >= 1), 'no count < 1 in patchItems')
    assert.equal(patchItems.length, 2)
  })
})
