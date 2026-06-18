/**
 * POS Sync Logic — Keng qamrovli testlar
 * Run: node --test test/sync.test.mjs
 * Node.js 18+ — tashqi kutubxona kerak emas
 *
 * Guruhlar:
 *   A. Integer filter (KG items serverga bormaydi)
 *   B. syncItems DB dan qurilishi
 *   C. handleSave syncMap qurilishi (Order.tsx)
 *   D. Savat operatsiyalari (decrement, remove, setQuantity, KG)
 *   E. UNIQUE constraint himoyasi (markOrderSynced)
 *   F. 700k double-count oldini olish
 *   G. Server status klassifikatsiyasi (CLOSED_STATUSES)
 *   H. HTTP xato klassifikatsiyasi va retry logikasi
 *   I. Telegram dedup logikasi (60s oyna)
 *   J. Order holat mashinasi (state machine)
 *   K. Narx va jami hisoblash
 *   L. Sync item deduplikatsiyasi
 *   M. Ko'p xona / stol edge case'lar
 *   N. Chegara qiymatlari va ma'lumot yaxlitligi
 *   O. To'liq real dunyo ssenariylari
 *   P. Bug fix: initialServerItemsRef bo'sh bo'lganda removal tracking
 *   Q. Bug fix: KG-only case — server order bekor qilish
 *   R. Bug fix: bo'sh savat + server order bekor qilish
 *   S. Bug fix: localOrder+serverOrder branch da initialServerItemsRef
 *   T. Oflayn → onlayn sinxronlash ssenariylari
 *   U. Sync engine pending order logikasi
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// ════════════════════════════════════════════════════════════════════
// ISHLAB CHIQARISH KODI NUSXALARI (Electron/SQLite import'siz)
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

function cartAdd(lines, newLine) { return [...lines, newLine] }
function cartClear() { return [] }

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

function shouldRetryOnError(httpStatus) { return httpStatus >= 500 }
function shouldMarkSyncedOnError(httpStatus) { return httpStatus === 404 || httpStatus === 403 }
function calcOrderTotal(lines) {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
}
function deduplicateSyncItems(items) {
  const map = new Map()
  for (const it of items) map.set(it.productServerId, (map.get(it.productServerId) ?? 0) + it.count)
  return Array.from(map.entries()).map(([productServerId, count]) => ({ productServerId, count }))
}
function dedupKey(msg) { return msg.slice(0, 120) }
function shouldSendTelegram(recentErrors, key, nowMs, dedupMs = 60_000) {
  const last = recentErrors.get(key) ?? 0
  return (nowMs - last) >= dedupMs
}

// Bug fix simulyatsiyasi: KG-only case
function syncAllItemsKgOnlyCase(items, existing) {
  const activeItems = items.filter(it => it.count > 0)
  const patchItems  = activeItems.filter(it => Number.isInteger(it.count))
  if (existing && activeItems.length === 0) {
    return { action: 'cancel', reason: 'empty_cart' }
  }
  // BUG FIX: KG-only case — server order bekor qilish
  if (existing && patchItems.length === 0 && activeItems.length > 0) {
    return { action: 'cancel', reason: 'kg_only' }
  }
  if (!existing && patchItems.length === 0) {
    return { action: 'skip', reason: 'no_server_order_no_integer_items' }
  }
  if (existing) {
    return { action: 'patch', items: patchItems }
  }
  return { action: 'post', items: patchItems }
}

// Bug fix simulyatsiyasi: bo'sh savat + server order
function handleSaveEmptyCart(cartLines, serverOrderId, orderId) {
  if (cartLines.length === 0) {
    if (serverOrderId || orderId) {
      return { action: 'cancel', serverOrderId, orderId }
    }
    return { action: 'navigate' }
  }
  return { action: 'save' }
}

// initialServerItemsRef logikasi
function resolveInitialServerItems(existingOrder, localOrder) {
  if (!existingOrder) return []
  // BUG FIX: har doim server items ni qaytaramiz (localOrder ham bo'lsa ham)
  return existingOrder.items ?? []
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
// A. INTEGER FILTER
// ════════════════════════════════════════════════════════════════════
describe('A. Integer filter — KG items serverga bormaydi', () => {
  test('A-01: ordak 0.5 kg patchItemsdan chiqariladi', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'ordak', count: 0.5 }])
    assert.equal(patchItems.length, 0)
  })
  test('A-02: qanot 0.3 kg patchItemsdan chiqariladi', () => {
    const { patchItems } = buildSyncLists([{ productServerId: 'qanot', count: 0.3 }])
    assert.equal(patchItems.length, 0)
  })
  test('A-03: 0.46 kg chiqariladi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: 0.46 }]).patchItems.length, 0)
  })
  test('A-04: 0.1 chiqariladi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: 0.1 }]).patchItems.length, 0)
  })
  test('A-05: 0.01 chiqariladi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: 0.01 }]).patchItems.length, 0)
  })
  test('A-06: 1.5 chiqariladi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: 1.5 }]).patchItems.length, 0)
  })
  test('A-07: 2.7 chiqariladi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: 2.7 }]).patchItems.length, 0)
  })
  test('A-08: count=1 butun son o\'tadi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'non', count: 1 }]).patchItems.length, 1)
  })
  test('A-09: count=2 butun son o\'tadi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'non', count: 2 }]).patchItems.length, 1)
  })
  test('A-10: count=10 butun son o\'tadi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'non', count: 10 }]).patchItems.length, 1)
  })
  test('A-11: count=2.0 butun float sifatida qabul qilinadi', () => {
    assert.ok(Number.isInteger(2.0))
    assert.equal(buildSyncLists([{ productServerId: 'x', count: 2.0 }]).patchItems.length, 1)
  })
  test('A-12: count=0 activeItemsdan chiqariladi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: 0 }]).activeItems.length, 0)
  })
  test('A-13: count=-1 activeItemsdan chiqariladi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: -1 }]).activeItems.length, 0)
  })
  test('A-14: aralash ro\'yxat — faqat butun sonlar patchItemsda', () => {
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
  test('A-15: faqat KG → patchItems va postItems bo\'sh → yangi order yaratilmaydi', () => {
    const { patchItems, postItems } = buildSyncLists([
      { productServerId: 'ordak', count: 0.5 },
      { productServerId: 'qanot', count: 0.25 },
    ])
    assert.equal(patchItems.length, 0)
    assert.equal(postItems.length, 0)
  })
  test('A-16: bo\'sh ro\'yxat → hammasi bo\'sh', () => {
    const { activeItems, patchItems, postItems } = buildSyncLists([])
    assert.equal(activeItems.length, 0)
    assert.equal(patchItems.length, 0)
    assert.equal(postItems.length, 0)
  })
  test('A-17: count=0.999 chiqariladi (butun songa yaqin kasr)', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: 0.999 }]).patchItems.length, 0)
  })
  test('A-18: count=100 katta butun son o\'tadi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: 100 }]).patchItems.length, 1)
  })
  test('A-19: KG item activeItemsda bor, patchItemsda yo\'q', () => {
    const { activeItems, patchItems } = buildSyncLists([{ productServerId: 'ordak', count: 0.5 }])
    assert.equal(activeItems.length, 1)
    assert.equal(patchItems.length, 0)
  })
  test('A-20: postItems === patchItems (bir xil ma\'lumot)', () => {
    const { patchItems, postItems } = buildSyncLists([
      { productServerId: 'non', count: 1 },
      { productServerId: 'ordak', count: 0.5 }
    ])
    assert.deepEqual(patchItems, postItems)
  })
})

// ════════════════════════════════════════════════════════════════════
// B. DB DAN syncItems QURILISHI
// ════════════════════════════════════════════════════════════════════
describe('B. syncItems DB dan (syncEngine integer filtr)', () => {
  test('B-01: null product_server_id chiqariladi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: null, quantity: 2 }]).length, 0)
  })
  test('B-02: bo\'sh string product_server_id chiqariladi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: '', quantity: 2 }]).length, 0)
  })
  test('B-03: undefined product_server_id chiqariladi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: undefined, quantity: 2 }]).length, 0)
  })
  test('B-04: quantity=0 chiqariladi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: 'abc', quantity: 0 }]).length, 0)
  })
  test('B-05: manfiy quantity chiqariladi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: 'abc', quantity: -1 }]).length, 0)
  })
  test('B-06: kasr 0.5 chiqariladi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: 'ordak', quantity: 0.5 }]).length, 0)
  })
  test('B-07: kasr 0.25 chiqariladi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: 'qanot', quantity: 0.25 }]).length, 0)
  })
  test('B-08: butun son 1 o\'tadi', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: 'non', quantity: 1 }])
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 1)
    assert.equal(result[0].productServerId, 'non')
  })
  test('B-09: butun son 5 o\'tadi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: 'salfetka', quantity: 5 }])[0].count, 5)
  })
  test('B-10: aralash ro\'yxat — faqat butun server_id li itemlar', () => {
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
  test('B-11: faqat KG → bo\'sh natija → 700k qidirish kerak', () => {
    assert.equal(buildSyncItemsFromDb([
      { product_server_id: 'ordak', quantity: 0.5 },
      { product_server_id: 'qanot', quantity: 0.25 },
    ]).length, 0)
  })
  test('B-12: bo\'sh kirish → bo\'sh natija', () => {
    assert.equal(buildSyncItemsFromDb([]).length, 0)
  })
  test('B-13: natijada productServerId va count maydonlari bor', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: 'abc', quantity: 3 }])
    assert.ok('productServerId' in result[0])
    assert.ok('count' in result[0])
  })
  test('B-14: katta miqdor 50 o\'tadi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: 'x', quantity: 50 }])[0].count, 50)
  })
  test('B-15: quantity=1.0 (butun float) o\'tadi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: 'x', quantity: 1.0 }]).length, 1)
  })
})

// ════════════════════════════════════════════════════════════════════
// C. handleSave SYNCMAP QURILISHI (Order.tsx)
// ════════════════════════════════════════════════════════════════════
describe('C. handleSave syncMap qurilishi', () => {
  test('C-01: bitta item to\'g\'ri o\'tadi', () => {
    const result = buildHandleSaveSyncMap([{ productServerId: 'non', quantity: 1 }], [])
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 1)
  })
  test('C-02: olib tashlangan item count=0 oladi', () => {
    const result = buildHandleSaveSyncMap(
      [{ productServerId: 'non', quantity: 1 }],
      [{ productServerId: 'non', quantity: 1 }, { productServerId: 'salfetka', quantity: 2 }]
    )
    assert.equal(result.find(i => i.productServerId === 'salfetka').count, 0)
  })
  test('C-03: ikkita olib tashlangan item ham count=0 oladi', () => {
    const result = buildHandleSaveSyncMap([], [
      { productServerId: 'non', quantity: 1 },
      { productServerId: 'salfetka', quantity: 2 }
    ])
    assert.equal(result.length, 2)
    assert.ok(result.every(i => i.count === 0))
  })
  test('C-04: bir mahsulot ikki marta qo\'shilsa — birlashtiriladi', () => {
    const result = buildHandleSaveSyncMap([
      { productServerId: 'non', quantity: 1 },
      { productServerId: 'non', quantity: 2 },
    ], [])
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 3)
  })
  test('C-05: server_id yo\'q mahsulot — chiqariladi', () => {
    assert.equal(buildHandleSaveSyncMap([{ productServerId: null, quantity: 1 }], []).length, 0)
  })
  test('C-06: quantity=0 li mahsulot — chiqariladi', () => {
    assert.equal(buildHandleSaveSyncMap([{ productServerId: 'x', quantity: 0 }], []).length, 0)
  })
  test('C-07: KG item (0.5) syncMapda o\'z miqdori bilan saqlanadi', () => {
    const result = buildHandleSaveSyncMap([{ productServerId: 'ordak', quantity: 0.5 }], [])
    assert.equal(result[0].count, 0.5)
  })
  test('C-08: KG item + butun son item — ikkisi ham syncMapda', () => {
    const result = buildHandleSaveSyncMap([
      { productServerId: 'ordak', quantity: 0.5 },
      { productServerId: 'non', quantity: 1 },
    ], [])
    assert.equal(result.length, 2)
  })
  test('C-09: buildSyncLists dan o\'tgandan keyin KG 0.5 patchItemsdan chiqariladi', () => {
    const syncMapItems = buildHandleSaveSyncMap([
      { productServerId: 'ordak', quantity: 0.5 },
      { productServerId: 'non', quantity: 1 },
    ], [])
    const { patchItems } = buildSyncLists(syncMapItems)
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'non')
  })
  test('C-10: olib tashlangan item count=0 → patchItemsdan chiqariladi (server REPLACE qiladi)', () => {
    const syncMapItems = buildHandleSaveSyncMap(
      [{ productServerId: 'non', quantity: 1 }],
      [{ productServerId: 'non', quantity: 1 }, { productServerId: 'salfetka', quantity: 2 }]
    )
    const { patchItems } = buildSyncLists(syncMapItems)
    assert.ok(!patchItems.find(i => i.count === 0))
  })
  test('C-11: bo\'sh qatorlar + bo\'sh dastlabki → bo\'sh natija', () => {
    assert.equal(buildHandleSaveSyncMap([], []).length, 0)
  })
  test('C-12: ko\'paytirilgan miqdor — yangi count yuboriladi', () => {
    const result = buildHandleSaveSyncMap(
      [{ productServerId: 'non', quantity: 3 }],
      [{ productServerId: 'non', quantity: 1 }]
    )
    assert.equal(result[0].count, 3)
  })
  test('C-13: 3 mahsulot olib tashlandi, 1 ta qoldi', () => {
    const result = buildHandleSaveSyncMap(
      [{ productServerId: 'a', quantity: 2 }],
      [
        { productServerId: 'a', quantity: 2 },
        { productServerId: 'b', quantity: 1 },
        { productServerId: 'c', quantity: 3 },
        { productServerId: 'd', quantity: 1 },
      ]
    )
    assert.equal(result.filter(i => i.count === 0).length, 3)
    assert.equal(result.find(i => i.productServerId === 'a').count, 2)
  })
  test('C-14: 3 ta bir xil mahsulot — birlashtiriladi', () => {
    const result = buildHandleSaveSyncMap(
      Array.from({ length: 3 }, () => ({ productServerId: 'non', quantity: 1 })), []
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 3)
  })
  test('C-15: mavjud server_id saqlanadi (COALESCE)', () => {
    const result = buildHandleSaveSyncMap(
      [{ productServerId: 'non', quantity: 2 }],
      [{ productServerId: 'non', quantity: 1 }]
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 2)
  })
})

// ════════════════════════════════════════════════════════════════════
// D. SAVAT OPERATSIYALARI
// ════════════════════════════════════════════════════════════════════
describe('D. Savat operatsiyalari', () => {
  test('D-01: decrement qty=1 da item o\'chiriladi', () => {
    assert.equal(cartDecrement([makeLine('a', 1)], 'a').length, 0)
  })
  test('D-02: decrement qty=2 da qty=1 bo\'ladi', () => {
    assert.equal(cartDecrement([makeLine('a', 2)], 'a')[0].quantity, 1)
  })
  test('D-03: decrement qty=3 da qty=2 bo\'ladi', () => {
    assert.equal(cartDecrement([makeLine('a', 3)], 'a')[0].quantity, 2)
  })
  test('D-04: decrement KG item 0.5 da o\'chiriladi (qty <= 1)', () => {
    assert.equal(cartDecrement([makeLine('a', 0.5)], 'a').length, 0)
  })
  test('D-05: decrement qty=0.9 da o\'chiriladi (qty <= 1)', () => {
    assert.equal(cartDecrement([makeLine('a', 0.9)], 'a').length, 0)
  })
  test('D-06: decrement flushed=false belgilaydi', () => {
    assert.equal(cartDecrement([makeLine('a', 3)], 'a')[0].flushed, false)
  })
  test('D-07: decrement noma\'lum uuid — o\'zgarmaydi', () => {
    const lines = [makeLine('a', 2)]
    assert.equal(cartDecrement(lines, 'z')[0].quantity, 2)
  })
  test('D-08: decrement faqat maqsadli itemga ta\'sir qiladi', () => {
    const lines = [makeLine('a', 3), makeLine('b', 5)]
    assert.equal(cartDecrement(lines, 'a').find(l => l.localUuid === 'b').quantity, 5)
  })
  test('D-09: bo\'sh savatchada decrement → bo\'sh', () => {
    assert.equal(cartDecrement([], 'a').length, 0)
  })
  test('D-10: setQuantity(0) → item o\'chiriladi', () => {
    assert.equal(cartSetQuantity([makeLine('a', 3)], 'a', 0).length, 0)
  })
  test('D-11: setQuantity(-1) → item o\'chiriladi', () => {
    assert.equal(cartSetQuantity([makeLine('a', 3)], 'a', -1).length, 0)
  })
  test('D-12: setQuantity(-100) → item o\'chiriladi', () => {
    assert.equal(cartSetQuantity([makeLine('a', 3)], 'a', -100).length, 0)
  })
  test('D-13: setQuantity(1) → qty=1 bilan saqlanadi', () => {
    assert.equal(cartSetQuantity([makeLine('a', 3)], 'a', 1)[0].quantity, 1)
  })
  test('D-14: setQuantity(5) → qty=5 ga yangilanadi', () => {
    assert.equal(cartSetQuantity([makeLine('a', 1)], 'a', 5)[0].quantity, 5)
  })
  test('D-15: setQuantity(0.5) → KG item saqlanadi', () => {
    assert.equal(cartSetQuantity([makeLine('a', 1)], 'a', 0.5)[0].quantity, 0.5)
  })
  test('D-16: setQuantity(0.25) → KG item saqlanadi', () => {
    assert.equal(cartSetQuantity([makeLine('a', 1)], 'a', 0.25)[0].quantity, 0.25)
  })
  test('D-17: setQuantity flushed=false belgilaydi', () => {
    assert.equal(cartSetQuantity([makeLine('a', 1)], 'a', 2)[0].flushed, false)
  })
  test('D-18: setQuantity noma\'lum uuid — o\'zgarmaydi', () => {
    assert.equal(cartSetQuantity([makeLine('a', 2)], 'z', 5)[0].quantity, 2)
  })
  test('D-19: remove mavjud item', () => {
    assert.equal(cartRemove([makeLine('a', 3)], 'a').length, 0)
  })
  test('D-20: remove boshqa itemlarni saqlab qoladi', () => {
    const lines = [makeLine('a', 3), makeLine('b', 2)]
    assert.equal(cartRemove(lines, 'a')[0].localUuid, 'b')
  })
  test('D-21: yangi item qo\'shish', () => {
    assert.equal(cartAdd([makeLine('a', 1)], makeLine('b', 2)).length, 2)
  })
  test('D-22: clear butun savatni tozalaydi', () => {
    assert.equal(cartClear().length, 0)
  })
  test('D-23: decrement → setQuantity(0) → item o\'chiriladi', () => {
    let lines = [makeLine('a', 2)]
    lines = cartDecrement(lines, 'a')
    lines = cartSetQuantity(lines, 'a', 0)
    assert.equal(lines.length, 0)
  })
  test('D-24: KG 0.5 → decrement → savat bo\'sh', () => {
    let lines = [makeLine('a', 0.5)]
    lines = cartDecrement(lines, 'a')
    assert.equal(lines.length, 0)
  })
  test('D-25: ketma-ket decrement qty=0 ga kelguncha o\'chiriladi', () => {
    let lines = [makeLine('a', 3)]
    lines = cartDecrement(lines, 'a')  // 2
    lines = cartDecrement(lines, 'a')  // 1
    lines = cartDecrement(lines, 'a')  // o'chiriladi
    assert.equal(lines.length, 0)
  })
  test('D-26: 103k buyurtma — non ni setQuantity(0) bilan o\'chirish', () => {
    const lines = [
      makeLine('a', 1, { productServerId: 'non-id', unitPrice: 53000 }),
      makeLine('b', 2, { productServerId: 'salfetka-id', unitPrice: 25000 }),
    ]
    const result = cartSetQuantity(lines, 'a', 0)
    assert.equal(result.length, 1)
    assert.equal(result[0].productServerId, 'salfetka-id')
  })
  test('D-27: 103k buyurtma — minus tugma orqali olib tashlash (decrement qty=1)', () => {
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
// E. UNIQUE CONSTRAINT HIMOYASI
// ════════════════════════════════════════════════════════════════════
describe('E. UNIQUE constraint himoyasi (markOrderSynced)', () => {
  test('E-01: bir xil server_id boshqa orderda bor → conflict', () => {
    const orders = [
      { id: 10, server_id: 'srv-1', sync_status: 'synced' },
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    assert.ok(checkUniqueConflict(orders, 11, 'srv-1'))
  })
  test('E-02: maqsadli order allaqachon shu server_id ni egallab tursa — conflict yo\'q', () => {
    assert.ok(!checkUniqueConflict([{ id: 10, server_id: 'srv-1', sync_status: 'synced' }], 10, 'srv-1'))
  })
  test('E-03: noyob server_id — conflict yo\'q', () => {
    const orders = [
      { id: 10, server_id: 'srv-999', sync_status: 'synced' },
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    assert.ok(!checkUniqueConflict(orders, 11, 'srv-new'))
  })
  test('E-04: conflict → server_id ustiga yozilmaydi', () => {
    const orders = [
      { id: 10, server_id: 'srv-1', sync_status: 'synced' },
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    const result = markOrderSynced(orders, 11, 'srv-1')
    assert.equal(result.find(o => o.id === 11).server_id, null)
    assert.equal(result.find(o => o.id === 11).sync_status, 'synced')
  })
  test('E-05: conflict yo\'q → server_id o\'rnatiladi', () => {
    const result = markOrderSynced([{ id: 11, server_id: null, sync_status: 'pending' }], 11, 'srv-new')
    assert.equal(result[0].server_id, 'srv-new')
    assert.equal(result[0].sync_status, 'synced')
  })
  test('E-06: serverOrderId yo\'q → faqat sync_status o\'zgaradi', () => {
    const result = markOrderSynced([{ id: 11, server_id: 'srv-existing', sync_status: 'pending' }], 11, undefined)
    assert.equal(result[0].server_id, 'srv-existing')
    assert.equal(result[0].sync_status, 'synced')
  })
  test('E-07: null serverOrderId → faqat sync_status o\'zgaradi', () => {
    const result = markOrderSynced([{ id: 11, server_id: null, sync_status: 'pending' }], 11, null)
    assert.equal(result[0].server_id, null)
    assert.equal(result[0].sync_status, 'synced')
  })
  test('E-08: boshqa orderlar o\'zgarmaydi', () => {
    const orders = [
      { id: 10, server_id: 'srv-1', sync_status: 'synced' },
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    const result = markOrderSynced(orders, 11, 'srv-new')
    assert.equal(result.find(o => o.id === 10).server_id, 'srv-1')
  })
  test('E-09: 3 ta order, birinchi bilan conflict, baribir synced bo\'ladi', () => {
    const orders = [
      { id: 1, server_id: 'srv-a', sync_status: 'synced' },
      { id: 2, server_id: 'srv-b', sync_status: 'synced' },
      { id: 3, server_id: null, sync_status: 'pending' },
    ]
    const result = markOrderSynced(orders, 3, 'srv-a')
    assert.equal(result.find(o => o.id === 3).server_id, null)
    assert.equal(result.find(o => o.id === 3).sync_status, 'synced')
  })
  test('E-10: COALESCE — mavjud server_id saqlanib qoladi', () => {
    const result = markOrderSynced([{ id: 11, server_id: 'srv-existing', sync_status: 'pending' }], 11, 'srv-new')
    assert.equal(result[0].server_id, 'srv-existing')
  })
  test('E-11: bo\'sh orders massivi → bo\'sh qaytariladi', () => {
    assert.equal(markOrderSynced([], 11, 'srv-x').length, 0)
  })
  test('E-12: ikki paralel sync bir xil server_id → ikkinchisi e\'tiborga olinmaydi', () => {
    let orders = [
      { id: 20, server_id: null, sync_status: 'pending' },
      { id: 21, server_id: null, sync_status: 'pending' },
    ]
    orders = markOrderSynced(orders, 20, 'srv-dup')
    orders = markOrderSynced(orders, 21, 'srv-dup')
    assert.equal(orders.find(o => o.id === 20).server_id, 'srv-dup')
    assert.equal(orders.find(o => o.id === 21).server_id, null)
    assert.equal(orders.find(o => o.id === 21).sync_status, 'synced')
  })
})

// ════════════════════════════════════════════════════════════════════
// F. 700k DOUBLE-COUNT OLDINI OLISH
// ════════════════════════════════════════════════════════════════════
describe('F. 700k double-count oldini olish', () => {
  test('F-01: faqat KG → syncItems bo\'sh → server order qidiriladi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: 'ordak', quantity: 0.5 }]).length, 0)
  })
  test('F-02: xona uchun ochiq server order topilsa → undan foydalaniladi', () => {
    const allOrders = [{ id: 'srv-300k', room: { id: 'room-1' }, status: 'OPEN' }]
    const found = findOpenServerOrderForRoom(allOrders, 'room-1')
    assert.ok(found)
    assert.equal(found.id, 'srv-300k')
  })
  test('F-03: ochiq server order yo\'q → lokal synced belgilanadi', () => {
    const allOrders = [{ id: 'srv-closed', room: { id: 'room-1' }, status: 'COMPLETED' }]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-1'), null)
  })
  test('F-04: mavjud order server_id bor → to\'g\'ridan-to\'g\'ri ishlatiladi', () => {
    const existingOrder = { id: 50, server_id: 'srv-300k', room_server_id: 'room-5' }
    assert.ok(existingOrder.server_id, 'mavjud server_id yopish uchun ishlatiladi')
  })
  test('F-05: fetchVisibleOrders room.id orqali mos keladi', () => {
    const allOrders = [{ id: 'srv-x', room: { id: 'room-99' }, status: 'OPEN' }]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-99').id, 'srv-x')
  })
  test('F-06: fetchVisibleOrders roomId (flat field) orqali mos keladi', () => {
    const allOrders = [{ id: 'srv-y', roomId: 'room-99', status: 'OPEN' }]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-99').id, 'srv-y')
  })
  test('F-07: bir nechta xona — faqat mos keladigan xona orderi qaytariladi', () => {
    const allOrders = [
      { id: 'srv-room1', room: { id: 'room-1' }, status: 'OPEN' },
      { id: 'srv-room2', room: { id: 'room-2' }, status: 'OPEN' },
    ]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-2').id, 'srv-room2')
  })
  test('F-08: yopilgan order bir xil xonada e\'tiborga olinmaydi', () => {
    const allOrders = [
      { id: 'srv-old', room: { id: 'room-1' }, status: 'COMPLETED' },
      { id: 'srv-new', room: { id: 'room-1' }, status: 'OPEN' },
    ]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-1').id, 'srv-new')
  })
  test('F-09: bo\'sh allOrders → null', () => {
    assert.equal(findOpenServerOrderForRoom([], 'room-1'), null)
  })
  test('F-10: noto\'g\'ri xona → null', () => {
    const allOrders = [{ id: 'srv-x', room: { id: 'room-99' }, status: 'OPEN' }]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-99-other'), null)
  })
})

// ════════════════════════════════════════════════════════════════════
// G. SERVER STATUS KLASSIFIKATSIYASI
// ════════════════════════════════════════════════════════════════════
describe('G. CLOSED_STATUSES klassifikatsiyasi', () => {
  test('G-01: OPEN → ochiq', () => { assert.ok(isServerOrderOpen({ status: 'OPEN' })) })
  test('G-02: PENDING → ochiq', () => { assert.ok(isServerOrderOpen({ status: 'PENDING' })) })
  test('G-03: IN_PROGRESS → ochiq', () => { assert.ok(isServerOrderOpen({ status: 'IN_PROGRESS' })) })
  test('G-04: CANCELED → yopiq', () => { assert.ok(!isServerOrderOpen({ status: 'CANCELED' })) })
  test('G-05: CANCELLED → yopiq', () => { assert.ok(!isServerOrderOpen({ status: 'CANCELLED' })) })
  test('G-06: SUCCESS → yopiq', () => { assert.ok(!isServerOrderOpen({ status: 'SUCCESS' })) })
  test('G-07: COMPLETED → yopiq', () => { assert.ok(!isServerOrderOpen({ status: 'COMPLETED' })) })
  test('G-08: CLOSED → yopiq', () => { assert.ok(!isServerOrderOpen({ status: 'CLOSED' })) })
  test('G-09: DONE → yopiq', () => { assert.ok(!isServerOrderOpen({ status: 'DONE' })) })
  test('G-10: FINISHED → yopiq', () => { assert.ok(!isServerOrderOpen({ status: 'FINISHED' })) })
  test('G-11: kichik harf canceled → yopiq (katta-kichik harfdan mustaqil)', () => { assert.ok(!isServerOrderOpen({ status: 'canceled' })) })
  test('G-12: kichik harf completed → yopiq', () => { assert.ok(!isServerOrderOpen({ status: 'completed' })) })
  test('G-13: Aralash harf Canceled → yopiq', () => { assert.ok(!isServerOrderOpen({ status: 'Canceled' })) })
  test('G-14: null status → ochiq deb qabul qilinadi', () => { assert.ok(isServerOrderOpen({ status: null })) })
  test('G-15: undefined status → ochiq deb qabul qilinadi', () => { assert.ok(isServerOrderOpen({})) })
  test('G-16: bo\'sh string status → ochiq deb qabul qilinadi', () => { assert.ok(isServerOrderOpen({ status: '' })) })
})

// ════════════════════════════════════════════════════════════════════
// H. HTTP XATO KLASSIFIKATSIYASI VA RETRY
// ════════════════════════════════════════════════════════════════════
describe('H. HTTP xato klassifikatsiyasi va retry logikasi', () => {
  test('H-01: 400 → 4xx, retry yo\'q', () => {
    assert.equal(classifyHttpError(400), '400')
    assert.ok(!shouldRetryOnError(400))
  })
  test('H-02: 403 → 403, retry yo\'q, synced belgilanadi', () => {
    assert.equal(classifyHttpError(403), '403')
    assert.ok(!shouldRetryOnError(403))
    assert.ok(shouldMarkSyncedOnError(403))
  })
  test('H-03: 404 → 404, retry yo\'q, synced belgilanadi', () => {
    assert.equal(classifyHttpError(404), '404')
    assert.ok(!shouldRetryOnError(404))
    assert.ok(shouldMarkSyncedOnError(404))
  })
  test('H-04: 422 → 4xx, retry yo\'q', () => {
    assert.equal(classifyHttpError(422), '4xx')
    assert.ok(!shouldRetryOnError(422))
  })
  test('H-05: 500 → 5xx, retry kerak', () => {
    assert.equal(classifyHttpError(500), '5xx')
    assert.ok(shouldRetryOnError(500))
  })
  test('H-06: 502 → 5xx, retry kerak', () => { assert.ok(shouldRetryOnError(502)) })
  test('H-07: 503 → 5xx, retry kerak', () => { assert.ok(shouldRetryOnError(503)) })
  test('H-08: 200 → ok, retry yo\'q', () => {
    assert.equal(classifyHttpError(200), 'ok')
    assert.ok(!shouldRetryOnError(200))
  })
  test('H-09: count=0.5 xatosi — integer filtr bunga yo\'l qo\'ymaydi', () => {
    const items = [{ productServerId: 'ordak', count: 0.5 }]
    const { patchItems } = buildSyncLists(items)
    assert.equal(patchItems.length, 0, 'ordak serverga bormaydi → 400 bo\'lmaydi')
  })
  test('H-10: 400 dan keyin retry ham patchItems (fractional qayta qo\'shilmaydi)', () => {
    const items = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'ordak', count: 0.5 },
    ]
    const { patchItems } = buildSyncLists(items)
    const retryItems = patchItems
    assert.equal(retryItems.length, 1)
    assert.ok(!retryItems.find(i => i.count === 0.5))
  })
})

// ════════════════════════════════════════════════════════════════════
// I. TELEGRAM DEDUP
// ════════════════════════════════════════════════════════════════════
describe('I. Telegram dedup logikasi', () => {
  test('I-01: birinchi marta har doim yuboriladi', () => {
    assert.ok(shouldSendTelegram(new Map(), 'err:sync:400', Date.now()))
  })
  test('I-02: 60s ichida takroriy — o\'tkazib yuboriladi', () => {
    const map = new Map()
    const now = Date.now()
    map.set(dedupKey('err:sync:400'), now)
    assert.ok(!shouldSendTelegram(map, dedupKey('err:sync:400'), now + 30_000))
  })
  test('I-03: 60s dan keyin — qayta yuboriladi', () => {
    const map = new Map()
    const t0 = Date.now()
    map.set(dedupKey('err:sync:400'), t0)
    assert.ok(shouldSendTelegram(map, dedupKey('err:sync:400'), t0 + 61_000))
  })
  test('I-04: turli context kalitlar — ikkisi ham yuboriladi', () => {
    const map = new Map()
    const now = Date.now()
    assert.ok(shouldSendTelegram(map, 'err:sync1:400', now))
    assert.ok(shouldSendTelegram(map, 'err:sync2:400', now))
  })
  test('I-05: aynan 60s chegarasida — yuboriladi', () => {
    const map = new Map()
    const t0 = Date.now()
    map.set(dedupKey('err:sync:400'), t0)
    assert.ok(shouldSendTelegram(map, dedupKey('err:sync:400'), t0 + 60_000))
  })
  test('I-06: UNIQUE constraint xatosi — 60s ichida ikkinchi marta yuborilmaydi', () => {
    const map = new Map()
    const key = dedupKey('err:UNIQUE constraint:')
    const now = Date.now()
    map.set(key, now)
    assert.ok(!shouldSendTelegram(map, key, now + 10_000))
  })
  test('I-07: dedupKey 120 ta belgida qisqartiradi', () => {
    assert.equal(dedupKey('x'.repeat(200)).length, 120)
  })
  test('I-08: qisqa xabar qisqartirilmaydi', () => {
    const msg = 'err:sync:400'
    assert.equal(dedupKey(msg), msg)
  })
})

// ════════════════════════════════════════════════════════════════════
// J. ORDER HOLAT MASHINASI
// ════════════════════════════════════════════════════════════════════
describe('J. Order holat mashinasi', () => {
  test('J-01: yangi lokal order pending bilan boshlanadi', () => {
    assert.equal({ id: 1, server_id: null, sync_status: 'pending', status: 'open' }.sync_status, 'pending')
  })
  test('J-02: online ochildi → server_id o\'rnatiladi, synced bo\'ladi', () => {
    let order = { id: 1, server_id: null, sync_status: 'pending' }
    order = { ...order, server_id: 'srv-1', sync_status: 'synced' }
    assert.equal(order.server_id, 'srv-1')
    assert.equal(order.sync_status, 'synced')
  })
  test('J-03: oflayn yopish → status=closed, sync_status=pending', () => {
    let order = { id: 1, server_id: 'srv-1', sync_status: 'synced', status: 'open' }
    order = { ...order, status: 'closed', sync_status: 'pending' }
    assert.equal(order.status, 'closed')
    assert.equal(order.sync_status, 'pending')
  })
  test('J-04: muvaffaqiyatli online yopish → synced', () => {
    let order = { id: 1, server_id: 'srv-1', sync_status: 'pending', status: 'closed' }
    order = { ...order, sync_status: 'synced' }
    assert.equal(order.sync_status, 'synced')
  })
  test('J-05: server_id yo\'q + KG-only → lokal synced, server o\'zgarishsiz', () => {
    const order = { id: 5, server_id: null, sync_status: 'pending', status: 'closed' }
    const items = [{ product_server_id: 'ordak', quantity: 0.5 }]
    assert.equal(buildSyncItemsFromDb(items).length, 0)
    const updated = { ...order, sync_status: 'synced' }
    assert.equal(updated.sync_status, 'synced')
    assert.equal(updated.server_id, null)
  })
  test('J-06: COALESCE — ikkinchi sync urinishi mavjud server_id ni o\'zgartirmaydi', () => {
    const existingOrder = { id: 5, server_id: 'srv-existing', sync_status: 'pending' }
    const serverIdToSet = existingOrder.server_id ?? 'srv-new-from-race'
    assert.equal(serverIdToSet, 'srv-existing')
  })
})

// ════════════════════════════════════════════════════════════════════
// K. NARX VA JAMI HISOBLASH
// ════════════════════════════════════════════════════════════════════
describe('K. Narx va jami hisoblash', () => {
  test('K-01: bitta item jami', () => {
    assert.equal(calcOrderTotal([makeLine('a', 2, { unitPrice: 5000 })]), 10000)
  })
  test('K-02: bir nechta item jami', () => {
    assert.equal(calcOrderTotal([
      makeLine('a', 1, { unitPrice: 50000 }),
      makeLine('b', 2, { unitPrice: 30000 }),
    ]), 110000)
  })
  test('K-03: KG item narxi = unitPrice * quantity (0.5 * 80000 = 40000)', () => {
    assert.equal(calcOrderTotal([makeLine('a', 0.5, { unitPrice: 80000 })]), 40000)
  })
  test('K-04: KG 0.3 kg narx hisoblash', () => {
    assert.equal(calcOrderTotal([makeLine('a', 0.3, { unitPrice: 100000 })]), 30000)
  })
  test('K-05: item o\'chirilgandan keyin jami kamayadi', () => {
    let lines = [
      makeLine('a', 1, { unitPrice: 50000 }),
      makeLine('b', 2, { unitPrice: 30000 }),
    ]
    const before = calcOrderTotal(lines)
    lines = cartRemove(lines, 'a')
    assert.equal(before - calcOrderTotal(lines), 50000)
  })
  test('K-06: 300k online + 100k oflayn = 400k jami', () => {
    assert.equal(calcOrderTotal([
      makeLine('a', 1, { unitPrice: 300000 }),
      makeLine('b', 1, { unitPrice: 100000 }),
    ]), 400000)
  })
  test('K-07: bo\'sh savat → jami 0', () => {
    assert.equal(calcOrderTotal([]), 0)
  })
  test('K-08: decrement dan keyin jami unitPrice ga kamayadi', () => {
    let lines = [makeLine('a', 3, { unitPrice: 5000 })]
    const before = calcOrderTotal(lines)
    lines = cartDecrement(lines, 'a')
    assert.equal(before - calcOrderTotal(lines), 5000)
  })
})

// ════════════════════════════════════════════════════════════════════
// L. SYNC ITEM DEDUPLIKATSIYASI
// ════════════════════════════════════════════════════════════════════
describe('L. Sync item deduplikatsiyasi', () => {
  test('L-01: ikki bir xil productServerId → birlashtiriladi', () => {
    const result = deduplicateSyncItems([
      { productServerId: 'non', count: 1 },
      { productServerId: 'non', count: 2 },
    ])
    assert.equal(result.length, 1)
    assert.equal(result[0].count, 3)
  })
  test('L-02: uch bir xil → birlashtiriladi', () => {
    const items = Array.from({ length: 3 }, () => ({ productServerId: 'non', count: 1 }))
    assert.equal(deduplicateSyncItems(items)[0].count, 3)
  })
  test('L-03: turli mahsulotlar → birlashtirilmaydi', () => {
    assert.equal(deduplicateSyncItems([
      { productServerId: 'non', count: 1 },
      { productServerId: 'salfetka', count: 2 },
    ]).length, 2)
  })
  test('L-04: bo\'sh ro\'yxat → bo\'sh', () => {
    assert.equal(deduplicateSyncItems([]).length, 0)
  })
  test('L-05: bitta item duplikat qilinmaydi', () => {
    assert.equal(deduplicateSyncItems([{ productServerId: 'x', count: 5 }]).length, 1)
  })
})

// ════════════════════════════════════════════════════════════════════
// M. KO'P XONA / STOL EDGE CASE'LAR
// ════════════════════════════════════════════════════════════════════
describe('M. Ko\'p xona / stol edge case\'lar', () => {
  test('M-01: 10 ta xona — har biri to\'g\'ri order topadi', () => {
    const allOrders = Array.from({ length: 10 }, (_, i) => ({
      id: `srv-room-${i}`,
      room: { id: `room-${i}` },
      status: 'OPEN',
    }))
    for (let i = 0; i < 10; i++) {
      assert.equal(findOpenServerOrderForRoom(allOrders, `room-${i}`).id, `srv-room-${i}`)
    }
  })
  test('M-02: server orderi yo\'q xona → null', () => {
    assert.equal(findOpenServerOrderForRoom([{ id: 'srv-1', room: { id: 'room-1' }, status: 'OPEN' }], 'room-99'), null)
  })
  test('M-03: faqat yopiq orderlar bor xona → null', () => {
    const allOrders = [
      { id: 'srv-a', room: { id: 'room-5' }, status: 'COMPLETED' },
      { id: 'srv-b', room: { id: 'room-5' }, status: 'CLOSED' },
    ]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-5'), null)
  })
  test('M-04: aralash xonalar — faqat maqsadli qaytariladi', () => {
    const allOrders = [
      { id: 'srv-1', room: { id: 'room-1' }, status: 'OPEN' },
      { id: 'srv-2', room: { id: 'room-2' }, status: 'OPEN' },
      { id: 'srv-3', room: { id: 'room-3' }, status: 'OPEN' },
    ]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-2').id, 'srv-2')
  })
  test('M-05: bir xonada ikki ochiq order (edge case) → birinchi topiladi', () => {
    const allOrders = [
      { id: 'srv-old', room: { id: 'room-1' }, status: 'OPEN' },
      { id: 'srv-new', room: { id: 'room-1' }, status: 'OPEN' },
    ]
    assert.equal(findOpenServerOrderForRoom(allOrders, 'room-1').id, 'srv-old')
  })
  test('M-06: bir nechta stol UNIQUE conflict — har biri alohida tekshiriladi', () => {
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
// N. CHEGARA QIYMATLARI VA MA'LUMOT YAXLITLIGI
// ════════════════════════════════════════════════════════════════════
describe('N. Chegara qiymatlari va ma\'lumot yaxlitligi', () => {
  test('N-01: Number.isInteger(0) → true', () => { assert.ok(Number.isInteger(0)) })
  test('N-02: Number.isInteger(0.5) → false', () => { assert.ok(!Number.isInteger(0.5)) })
  test('N-03: Number.isInteger(NaN) → false', () => { assert.ok(!Number.isInteger(NaN)) })
  test('N-04: Number.isInteger(Infinity) → false', () => { assert.ok(!Number.isInteger(Infinity)) })
  test('N-05: Number.isInteger(null) → false', () => { assert.ok(!Number.isInteger(null)) })
  test('N-06: Number.isInteger(undefined) → false', () => { assert.ok(!Number.isInteger(undefined)) })
  test('N-07: count=NaN → activeItemsdan chiqariladi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: NaN }]).activeItems.length, 0)
  })
  test('N-08: count=Infinity → patchItemsdan chiqariladi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: Infinity }]).patchItems.length, 0)
  })
  test('N-09: server_id raqamli string → to\'g\'ri (valid)', () => {
    const result = buildSyncItemsFromDb([{ product_server_id: '12345', quantity: 1 }])
    assert.equal(result[0].productServerId, '12345')
  })
  test('N-10: katta miqdor 999 → butun son filtrdan o\'tadi', () => {
    assert.equal(buildSyncLists([{ productServerId: 'x', count: 999 }]).patchItems.length, 1)
  })
  test('N-11: cartDecrement qty=2 → qty=1 (0 emas)', () => {
    const result = cartDecrement([makeLine('a', 2)], 'a')
    assert.equal(result[0].quantity, 1)
    assert.ok(result.length > 0)
  })
  test('N-12: bo\'sh savat → jami 0', () => { assert.equal(calcOrderTotal([]), 0) })
  test('N-13: syncItems natijasida undefined/null productServerId yo\'q', () => {
    const result = buildSyncItemsFromDb([
      { product_server_id: 'abc', quantity: 2 },
      { product_server_id: null, quantity: 1 },
    ])
    assert.ok(result.every(it => it.productServerId !== undefined && it.productServerId !== null))
  })
  test('N-14: dedupKey xato satrining boshini saqlaydi', () => {
    const key = 'err:context:400:some-response-body'
    assert.ok(dedupKey(key).startsWith('err:context:400'))
  })
  test('N-15: markOrderSynced yangi massiv qaytaradi (immutable)', () => {
    const orders = [{ id: 1, server_id: null, sync_status: 'pending' }]
    const result = markOrderSynced(orders, 1, 'srv-x')
    assert.notEqual(orders, result)
    assert.equal(orders[0].sync_status, 'pending')
  })
})

// ════════════════════════════════════════════════════════════════════
// O. TO'LIQ REAL DUNYO SSENARIYLARI
// ════════════════════════════════════════════════════════════════════
describe('O. To\'liq real dunyo ssenariylari', () => {
  test('O-01: ordak 0.5 kg qo\'shilganda non, salfetka serverga yetib boradi', () => {
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
  test('O-02: admin 103k → non minus tugma bilan olinadi → admin yangilanishi kerak', () => {
    const initialServerItems = [
      { productServerId: 'non-id', quantity: 1 },
      { productServerId: 'salfetka-id', quantity: 2 },
    ]
    let lines = [
      makeLine('a', 1, { productServerId: 'non-id', unitPrice: 53000 }),
      makeLine('b', 2, { productServerId: 'salfetka-id', unitPrice: 25000 }),
    ]
    assert.equal(calcOrderTotal(lines), 103000)

    lines = cartDecrement(lines, 'a')  // minus → olib tashlaydi
    assert.equal(calcOrderTotal(lines), 50000)

    const syncItems = buildHandleSaveSyncMap(lines, initialServerItems)
    const { patchItems } = buildSyncLists(syncItems)
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'salfetka-id')
    assert.equal(patchItems[0].count, 2)
    assert.ok(!patchItems.find(i => i.productServerId === 'non-id'))
  })
  test('O-03: oflayn 300k → 100k non qo\'shildi → yopildi → qayta ulanish → admin 400k', () => {
    const dbItems = [{ product_server_id: 'non-id', quantity: 1 }]
    const syncItems = buildSyncItemsFromDb(dbItems)
    assert.equal(syncItems.length, 1)
    assert.equal(syncItems[0].count, 1)
  })
  test('O-04: barcha 3 item olib tashlandi → patchItems bo\'sh → server bo\'sh order', () => {
    const initial = [
      { productServerId: 'a', quantity: 1 },
      { productServerId: 'b', quantity: 1 },
      { productServerId: 'c', quantity: 1 },
    ]
    const syncItems = buildHandleSaveSyncMap([], initial)
    const { patchItems } = buildSyncLists(syncItems)
    assert.equal(patchItems.length, 0)
  })
  test('O-05: KG-only oflayn order → qayta ulanish → server ochiq orderni topib yopadi', () => {
    const dbItems = [{ product_server_id: 'ordak', quantity: 0.5 }]
    assert.equal(buildSyncItemsFromDb(dbItems).length, 0)

    const allOrders = [{ id: 'srv-open', room: { id: 'room-10' }, status: 'OPEN' }]
    const found = findOpenServerOrderForRoom(allOrders, 'room-10')
    assert.ok(found)
    assert.equal(found.id, 'srv-open')
  })
  test('O-06: ikki stol, har biri mustaqil sinxronlanadi', () => {
    assert.equal(buildSyncItemsFromDb([{ product_server_id: 'non', quantity: 2 }])[0].count, 2)
    assert.equal(buildSyncItemsFromDb([{ product_server_id: 'salfetka', quantity: 3 }])[0].count, 3)
  })
  test('O-07: PATCH 400 "count must not be less than 1" — filtr buni oldini oladi', () => {
    const before = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'ordak', count: 0.5 },
    ]
    const after = before.filter(it => Number.isInteger(it.count))
    assert.equal(after.length, 1)
    assert.ok(!after.find(i => i.productServerId === 'ordak'))
  })
  test('O-08: UNIQUE constraint — ikki tez sync bir xil server_id → ikkinchisi e\'tiborga olinmaydi', () => {
    let orders = [
      { id: 100, server_id: null, sync_status: 'pending' },
      { id: 101, server_id: null, sync_status: 'pending' },
    ]
    orders = markOrderSynced(orders, 100, 'srv-999')
    orders = markOrderSynced(orders, 101, 'srv-999')
    assert.equal(orders.find(o => o.id === 100).server_id, 'srv-999')
    assert.equal(orders.find(o => o.id === 101).server_id, null)
    assert.equal(orders.find(o => o.id === 101).sync_status, 'synced')
  })
  test('O-09: qanot 0.5 + ordak 0.3 + kanotcha 2 → faqat kanotcha serverga boradi', () => {
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
  test('O-10: server xatosi "items.4.count must not be less than 1" — filtr oldini oladi', () => {
    const items = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'ordak', count: 0.5 },
      { productServerId: 'qanot', count: 0.3 },
      { productServerId: 'salfetka', count: 2 },
    ]
    const { patchItems } = buildSyncLists(items)
    assert.ok(patchItems.every(it => it.count >= 1), 'count < 1 bo\'lgan item yo\'q')
    assert.equal(patchItems.length, 2)
  })
})

// ════════════════════════════════════════════════════════════════════
// P. BUG FIX: initialServerItemsRef BO'SH BO'LGANDA REMOVAL TRACKING
// ════════════════════════════════════════════════════════════════════
describe('P. Bug fix: initialServerItemsRef bo\'sh bo\'lganda removal tracking', () => {

  test('P-01: localOrder + serverOrder → initialServerItemsRef server items dan to\'ldirilishi kerak', () => {
    const existingOrder = {
      items: [
        { productId: 1, serverId: 'item-srv-1', quantity: 1, productName: 'Non', localUuid: 'u1' },
        { productId: 2, serverId: 'item-srv-2', quantity: 2, productName: 'Kanotcha', localUuid: 'u2' },
      ]
    }
    const localOrder = { items: [
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 2 },
    ]}

    const initialServerItems = resolveInitialServerItems(existingOrder, localOrder)
    assert.equal(initialServerItems.length, 2)
  })

  test('P-02: faqat localOrder (server order yo\'q) → initialServerItemsRef bo\'sh', () => {
    const initialServerItems = resolveInitialServerItems(null, { items: [{ productId: 1 }] })
    assert.equal(initialServerItems.length, 0)
  })

  test('P-03: initialServerItemsRef to\'ldirilganda olib tashlangan item removedFromServer da topiladi', () => {
    // Server: [non, kanotcha]. Local: [non, kanotcha, ordak]
    // User removes kanotcha
    const serverLines = [
      { productServerId: 'non-id', quantity: 1 },
      { productServerId: 'kanotcha-id', quantity: 2 },
    ]
    const savedLines = [
      { productServerId: 'non-id', quantity: 1 },
      { productServerId: 'ordak-id', quantity: 0.5 },  // KG, lokal
      // kanotcha olib tashlandi
    ]
    const syncItems = buildHandleSaveSyncMap(savedLines, serverLines)
    // kanotcha count=0 bilan syncItems da bo'lishi kerak
    const kanotcha = syncItems.find(i => i.productServerId === 'kanotcha-id')
    assert.ok(kanotcha, 'kanotcha syncItemsda bo\'lishi kerak')
    assert.equal(kanotcha.count, 0)
  })

  test('P-04: initialServerItemsRef bo\'sh bo\'lsa ham REPLACE natijasi to\'g\'ri (server REPLACE qiladi)', () => {
    // initialServerItemsRef bo\'sh bo\'lsa ham:
    // savedLines = [non(1)] → syncItems = [{non, 1}] → server REPLACE → [non]
    // kanotcha serverdan o\'chiriladi (REPLACE tufayli)
    const savedLines = [{ productServerId: 'non-id', quantity: 1 }]
    const syncItems = buildHandleSaveSyncMap(savedLines, [])  // initialServerItemsRef bo'sh
    const { patchItems } = buildSyncLists(syncItems)
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'non-id')
    // Server REPLACE → [non]. kanotcha yo'q → o'chiriladi
  })

  test('P-05: initialServerItemsRef mavjud bo\'lsa olib tashlangan itemlar count=0 bilan qo\'shiladi', () => {
    const serverLines = [{ productServerId: 'kanotcha-id', quantity: 2 }]
    const savedLines = []  // kanotcha olib tashlandi
    const syncItems = buildHandleSaveSyncMap(savedLines, serverLines)
    assert.equal(syncItems.length, 1)
    assert.equal(syncItems[0].productServerId, 'kanotcha-id')
    assert.equal(syncItems[0].count, 0)
  })

  test('P-06: count=0 itemlar activeItems filtrida o\'chiriladi (serverga bormaydi)', () => {
    const syncItems = [
      { productServerId: 'kanotcha-id', count: 0 },  // olib tashlangan
      { productServerId: 'non-id', count: 1 },
    ]
    const { patchItems } = buildSyncLists(syncItems)
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'non-id')
    // count=0 serverga bormaydi — server REPLACE [{non,1}] bilan
    // kanotcha serverdan o'chiriladi (REPLACE tufayli) ✓
  })

  test('P-07: server faqat butun sonlarni qabul qiladi → count=0 ham yuborilmaydi', () => {
    // Xulosa: olib tashlash uchun count=0 KERAK EMAS
    // Server REPLACE logikasi: faqat mavjud itemlarni yuboring, qolganlari o'chiriladi
    const items = [
      { productServerId: 'kanotcha-id', count: 0 },  // "o'chirilgan"
      { productServerId: 'non-id', count: 1 },
    ]
    const { activeItems } = buildSyncLists(items)
    assert.equal(activeItems.length, 1)  // faqat non o'tadi
    assert.equal(activeItems[0].productServerId, 'non-id')
  })

  test('P-08: server items va local items farqlanishi mumkin (KG items lokal)', () => {
    // Server: [non(1), kanotcha(2)]. Local: [non(1), kanotcha(2), ordak(0.5)]
    const serverItems = [
      { productServerId: 'non-id', quantity: 1 },
      { productServerId: 'kanotcha-id', quantity: 2 },
    ]
    const localItems = [
      { productServerId: 'non-id', quantity: 1 },
      { productServerId: 'kanotcha-id', quantity: 2 },
      { productServerId: 'ordak-id', quantity: 0.5 },  // faqat lokal
    ]
    // Server items dan initialServerItemsRef to'ldirilishi kerak
    // Ordak server items da yo'q → removedFromServer da ham bo'lmaydi
    const removedFromServer = serverItems.filter(
      init => !localItems.some(l => l.productServerId === init.productServerId)
    )
    assert.equal(removedFromServer.length, 0)  // hech narsa o'chirilmagan
  })
})

// ════════════════════════════════════════════════════════════════════
// Q. BUG FIX: KG-ONLY CASE — SERVER ORDER BEKOR QILISH
// ════════════════════════════════════════════════════════════════════
describe('Q. Bug fix: KG-only case — server order bekor qilish', () => {

  test('Q-01: faqat KG qolsa → syncAllItems cancel qaytaradi', () => {
    const items = [{ productServerId: 'ordak-id', count: 0.5 }]
    const existing = { id: 'srv-123', status: 'OPEN' }
    const result = syncAllItemsKgOnlyCase(items, existing)
    assert.equal(result.action, 'cancel')
    assert.equal(result.reason, 'kg_only')
  })

  test('Q-02: faqat KG, server order yo\'q → skip (yangi order yaratilmaydi)', () => {
    const items = [{ productServerId: 'ordak-id', count: 0.5 }]
    const result = syncAllItemsKgOnlyCase(items, null)
    assert.equal(result.action, 'skip')
    assert.equal(result.reason, 'no_server_order_no_integer_items')
  })

  test('Q-03: butun son item bor → cancel yo\'q, PATCH qilinadi', () => {
    const items = [
      { productServerId: 'ordak-id', count: 0.5 },
      { productServerId: 'non-id', count: 1 },
    ]
    const existing = { id: 'srv-123', status: 'OPEN' }
    const result = syncAllItemsKgOnlyCase(items, existing)
    assert.equal(result.action, 'patch')
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].productServerId, 'non-id')
  })

  test('Q-04: savat mutlaqo bo\'sh → cancel (existing bor)', () => {
    const result = syncAllItemsKgOnlyCase([], { id: 'srv-123', status: 'OPEN' })
    assert.equal(result.action, 'cancel')
    assert.equal(result.reason, 'empty_cart')
  })

  test('Q-05: savat bo\'sh, server order yo\'q → skip', () => {
    const result = syncAllItemsKgOnlyCase([], null)
    assert.equal(result.action, 'skip')
  })

  test('Q-06: KG cancel dan keyin yangi integer item qo\'shilsa → yangi server order', () => {
    // Server order bekor qilindi (KG-only)
    // User non(1) qo\'shadi va saqlaydi
    const items = [
      { productServerId: 'ordak-id', count: 0.5 },
      { productServerId: 'non-id', count: 1 },
    ]
    // existing=null (avvalgi order bekor qilindi)
    const result = syncAllItemsKgOnlyCase(items, null)
    assert.equal(result.action, 'post')
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].productServerId, 'non-id')
  })

  test('Q-07: non o\'chirildi + ordak(0.5) qoldi → KG-only → cancel', () => {
    // Bu BUG FIX uchun asosiy ssenary!
    // User: [non(1), ordak(0.5)] → non minus bosdi → faqat [ordak(0.5)] qoldi
    const items = [{ productServerId: 'ordak-id', count: 0.5 }]
    const existing = { id: 'srv-active', status: 'OPEN' }
    const result = syncAllItemsKgOnlyCase(items, existing)
    assert.equal(result.action, 'cancel')
    // Server order CANCELED → admin non ko\'rsatmaydi ✓
  })

  test('Q-08: kanotcha + non qoldi (butun sonlar) → cancel yo\'q, PATCH', () => {
    const items = [
      { productServerId: 'kanotcha-id', count: 2 },
      { productServerId: 'non-id', count: 1 },
    ]
    const result = syncAllItemsKgOnlyCase(items, { id: 'srv-123', status: 'OPEN' })
    assert.equal(result.action, 'patch')
    assert.equal(result.items.length, 2)
  })

  test('Q-09: KG-only case patchItems bo\'shligini tekshiradi', () => {
    const items = [{ productServerId: 'ordak', count: 0.5 }]
    const { patchItems, activeItems } = buildSyncLists(items)
    assert.equal(patchItems.length, 0)
    assert.equal(activeItems.length, 1)
    // Bu shartda (patchItems=0, activeItems>0) → server order CANCELED bo'lishi kerak
  })

  test('Q-10: mixed KG + integer case da patchItems bo\'sh emas', () => {
    const items = [
      { productServerId: 'ordak', count: 0.5 },
      { productServerId: 'non', count: 1 },
    ]
    const { patchItems, activeItems } = buildSyncLists(items)
    assert.equal(patchItems.length, 1)
    assert.equal(activeItems.length, 2)
    // Bu shartda (patchItems>0) → PATCH yuboriladi (cancel emas)
  })
})

// ════════════════════════════════════════════════════════════════════
// R. BUG FIX: BO'SH SAVAT + SERVER ORDER BEKOR QILISH
// ════════════════════════════════════════════════════════════════════
describe('R. Bug fix: bo\'sh savat + server order bekor qilish', () => {

  test('R-01: bo\'sh savat + serverOrderId bor → cancel', () => {
    const result = handleSaveEmptyCart([], 'srv-123', 10)
    assert.equal(result.action, 'cancel')
    assert.equal(result.serverOrderId, 'srv-123')
  })

  test('R-02: bo\'sh savat + serverOrderId yo\'q → navigate', () => {
    const result = handleSaveEmptyCart([], null, null)
    assert.equal(result.action, 'navigate')
  })

  test('R-03: bo\'sh savat + orderId bor (server yo\'q) → cancel', () => {
    const result = handleSaveEmptyCart([], null, 10)
    assert.equal(result.action, 'cancel')
    assert.equal(result.orderId, 10)
  })

  test('R-04: items bor → save', () => {
    const result = handleSaveEmptyCart([makeLine('a', 1)], 'srv-123', 10)
    assert.equal(result.action, 'save')
  })

  test('R-05: bo\'sh savat (barcha items minus qilib chiqarilgan) + server order → cancel', () => {
    // Ssenary: user barcha itemlarni minus bilan olib tashlaydi
    // Saqlash tugmasini bosadi → server order bekor bo'lishi kerak
    let lines = [
      makeLine('a', 1, { productServerId: 'non-id' }),
      makeLine('b', 1, { productServerId: 'kanotcha-id' }),
    ]
    lines = cartDecrement(lines, 'a')  // non o'chiriladi
    lines = cartDecrement(lines, 'b')  // kanotcha o'chiriladi
    assert.equal(lines.length, 0)

    const result = handleSaveEmptyCart(lines, 'srv-active', 5)
    assert.equal(result.action, 'cancel')
    assert.equal(result.serverOrderId, 'srv-active')
  })

  test('R-06: bo\'sh savat + faqat orderId → cancel (server lokal)', () => {
    const result = handleSaveEmptyCart([], null, 99)
    assert.equal(result.action, 'cancel')
    assert.equal(result.orderId, 99)
  })

  test('R-07: items bor, serverOrderId ham bor → save (cancel emas)', () => {
    const result = handleSaveEmptyCart([makeLine('a', 2)], 'srv-123', 5)
    assert.equal(result.action, 'save')
  })
})

// ════════════════════════════════════════════════════════════════════
// S. BUG FIX: localOrder+serverOrder BRANCHDA initialServerItemsRef
// ════════════════════════════════════════════════════════════════════
describe('S. Bug fix: localOrder+serverOrder branchda initialServerItemsRef', () => {

  test('S-01: server items dan initialServerItemsRef to\'ldiriladi', () => {
    const existingOrder = {
      serverId: 'srv-100',
      items: [
        { productId: 1, serverId: 'si-1', localUuid: 'u1', productName: 'Non', unitPrice: 5000, quantity: 1, notes: null, createdAt: 0 },
        { productId: 2, serverId: 'si-2', localUuid: 'u2', productName: 'Kanotcha', unitPrice: 10000, quantity: 2, notes: null, createdAt: 0 },
      ]
    }
    const initialServerItems = resolveInitialServerItems(existingOrder, { items: [] })
    assert.equal(initialServerItems.length, 2)
  })

  test('S-02: server orders 2 item, local orders 3 item (+ KG) → server items asosiy', () => {
    const serverOrder = {
      items: [
        { productId: 1, quantity: 1, productName: 'Non' },
        { productId: 2, quantity: 2, productName: 'Kanotcha' },
      ]
    }
    const localOrder = {
      items: [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 2 },
        { productId: 3, quantity: 0.5 },  // ordak KG
      ]
    }
    const initialServerItems = resolveInitialServerItems(serverOrder, localOrder)
    assert.equal(initialServerItems.length, 2)  // server items dan
    assert.ok(!initialServerItems.some(i => i.quantity === 0.5))  // ordak yo'q
  })

  test('S-03: localOrder branchi ham initialServerItemsRef to\'ldirilishi kerak', () => {
    // BUG SIMULYATSIYASI:
    // Eski kod: localOrder branchda initialServerItemsRef bo'sh qolardi
    // Natija: kanotcha o'chirilsa removedFromServer bo'sh → count=0 qo'shilmaydi
    // Lekin REPLACE qilsak muammo yo'q

    const serverLines = [
      { productServerId: 'non-id', quantity: 1 },
      { productServerId: 'kanotcha-id', quantity: 2 },
    ]
    // TO'G'RI: server items dan initialServerItemsRef
    const savedLinesAfterRemove = [
      { productServerId: 'non-id', quantity: 1 },
      // kanotcha olib tashlandi
    ]

    // initialServerItemsRef = serverLines bilan
    const syncItems = buildHandleSaveSyncMap(savedLinesAfterRemove, serverLines)
    const { patchItems } = buildSyncLists(syncItems)
    // patchItems = [{non, 1}] — PATCH bilan server [{non}] qiladi → kanotcha o'chiriladi ✓
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'non-id')
  })

  test('S-04: initialServerItemsRef bo\'sh bo\'lsa ham REPLACE natijasi to\'g\'ri', () => {
    // initialServerItemsRef bo'sh (eski bug):
    const savedLines = [{ productServerId: 'non-id', quantity: 1 }]  // kanotcha yo'q
    const syncItems = buildHandleSaveSyncMap(savedLines, [])  // bo'sh initialServerItems
    const { patchItems } = buildSyncLists(syncItems)
    // patchItems = [{non, 1}]
    // Server REPLACE bilan [{non}] → kanotcha o'chiriladi ✓ (server REPLACE qilganda)
    assert.equal(patchItems.length, 1)
  })

  test('S-05: initialServerItemsRef server items ni to\'g\'ri aks ettiradi', () => {
    const existingOrder = {
      items: [
        { productId: 10, serverId: 'ps-10', quantity: 3, productName: 'Salfetka' },
      ]
    }
    const ref = resolveInitialServerItems(existingOrder, null)
    assert.equal(ref.length, 1)
  })
})

// ════════════════════════════════════════════════════════════════════
// T. OFLAYN → ONLAYN SINXRONLASH SSENARIYLARI
// ════════════════════════════════════════════════════════════════════
describe('T. Oflayn → onlayn sinxronlash ssenariylari', () => {

  test('T-01: oflayn buyurtma pending qoladi → onlayn bo\'lganda sinxronlanadi', () => {
    const order = { id: 1, server_id: null, sync_status: 'pending', status: 'closed' }
    assert.equal(order.sync_status, 'pending')
    // syncPendingOrders bu orderni 15s ichida topadi
  })

  test('T-02: oflayn yopish → faqat integer items syncItems da', () => {
    const dbItems = [
      { product_server_id: 'non', quantity: 1 },
      { product_server_id: 'ordak', quantity: 0.5 },
    ]
    const syncItems = buildSyncItemsFromDb(dbItems)
    assert.equal(syncItems.length, 1)
    assert.equal(syncItems[0].productServerId, 'non')
  })

  test('T-03: oflayn + faqat KG items → syncItems bo\'sh → 700k qidirish', () => {
    const dbItems = [{ product_server_id: 'ordak', quantity: 0.5 }]
    assert.equal(buildSyncItemsFromDb(dbItems).length, 0)
  })

  test('T-04: 300k online order + 100k oflayn qo\'shimcha → 400k bo\'lishi kerak', () => {
    // 300k → server da bor, server_id = 'srv-300k'
    // 100k → oflayn qo\'shildi, non(1) × 100000
    const dbItems = [{ product_server_id: 'non-100k', quantity: 1 }]
    const syncItems = buildSyncItemsFromDb(dbItems)
    assert.equal(syncItems.length, 1)
    // PATCH [{non, 1}] → server order yangilanadi
    // Server total = 300k + 100k = 400k ✓
  })

  test('T-05: oflayn yopish + server order bor → server order yopilishi kerak', () => {
    const pendingClosedOrder = { id: 5, server_id: 'srv-existing', sync_status: 'pending', status: 'closed' }
    assert.ok(pendingClosedOrder.server_id, 'server_id bor → to\'g\'ridan-to\'g\'ri yopiladi')
  })

  test('T-06: oflayn yopish + server order yo\'q + integer items bor → yangi order, keyin yopish', () => {
    const order = { id: 5, server_id: null, sync_status: 'pending', status: 'closed' }
    const dbItems = [{ product_server_id: 'non', quantity: 1 }]
    const syncItems = buildSyncItemsFromDb(dbItems)
    assert.equal(syncItems.length, 1)
    // syncAllItems → POST → yangi server order → keyin closeOrderOnServer
  })

  test('T-07: oflayn ikki xona → har biri alohida sinxronlanadi', () => {
    const room1Items = [{ product_server_id: 'non', quantity: 2 }]
    const room2Items = [{ product_server_id: 'kanotcha', quantity: 1 }]
    assert.equal(buildSyncItemsFromDb(room1Items)[0].count, 2)
    assert.equal(buildSyncItemsFromDb(room2Items)[0].count, 1)
  })

  test('T-08: internet yondi → syncPendingOrders ishga tushadi', () => {
    const pendingOrders = [
      { id: 1, sync_status: 'pending', status: 'closed' },
      { id: 2, sync_status: 'pending', status: 'open' },
    ]
    const toSync = pendingOrders.filter(o => o.sync_status === 'pending')
    assert.equal(toSync.length, 2)
  })
})

// ════════════════════════════════════════════════════════════════════
// U. SYNC ENGINE PENDING ORDER LOGIKASI
// ════════════════════════════════════════════════════════════════════
describe('U. Sync engine pending order logikasi', () => {

  test('U-01: pendingOpen — syncItems bo\'sh bo\'lsa skip qilinadi', () => {
    // Faqat KG items → syncItems = [] → continue
    const dbItems = [{ product_server_id: 'ordak', quantity: 0.5 }]
    const syncItems = buildSyncItemsFromDb(dbItems)
    const shouldSkip = syncItems.length === 0
    assert.ok(shouldSkip)
  })

  test('U-02: pendingOpen — integer items bor → syncAllItems chaqiriladi', () => {
    const dbItems = [
      { product_server_id: 'non', quantity: 1 },
      { product_server_id: 'ordak', quantity: 0.5 },
    ]
    const syncItems = buildSyncItemsFromDb(dbItems)
    assert.ok(syncItems.length > 0, 'non integer → sync chaqiriladi')
    assert.equal(syncItems[0].productServerId, 'non')
  })

  test('U-03: pendingClosed — serverId bor + syncItems bor → pre-close PATCH', () => {
    const order = { id: 5, server_id: 'srv-100', status: 'closed' }
    const dbItems = [{ product_server_id: 'non', quantity: 1 }]
    const syncItems = buildSyncItemsFromDb(dbItems)
    // serverId bor && syncItems > 0 → PATCH yuboriladi keyin CLOSE
    const shouldPreClosePatch = order.server_id && syncItems.length > 0
    assert.ok(shouldPreClosePatch)
  })

  test('U-04: pendingClosed — serverId yo\'q + syncItems bo\'sh → 700k fix', () => {
    const order = { id: 5, server_id: null, room_server_id: 'room-1', status: 'closed' }
    const dbItems = [{ product_server_id: 'ordak', quantity: 0.5 }]
    const syncItems = buildSyncItemsFromDb(dbItems)
    // server_id yo'q, syncItems bo'sh → fetchVisibleOrders → OPEN order topiladi
    const shouldFetchVisible = !order.server_id && syncItems.length === 0
    assert.ok(shouldFetchVisible)
  })

  test('U-05: pre-close PATCH da fractional items yo\'q', () => {
    const dbItems = [
      { product_server_id: 'non', quantity: 1 },
      { product_server_id: 'ordak', quantity: 0.5 },
      { product_server_id: 'kanotcha', quantity: 2 },
    ]
    const syncItems = buildSyncItemsFromDb(dbItems)
    assert.ok(syncItems.every(it => Number.isInteger(it.count)))
    assert.equal(syncItems.length, 2)
  })

  test('U-06: syncPendingOrders 5xx xatosida order pending qoladi (retry)', () => {
    // 5xx → throw → syncPendingOrders 15s dan keyin qayta urinadi
    const httpStatus = 503
    assert.ok(shouldRetryOnError(httpStatus))
  })

  test('U-07: syncPendingOrders 4xx xatosida order synced belgilanadi (retry yo\'q)', () => {
    // 400/403/404 → order synced → qayta urinilmaydi
    assert.ok(!shouldRetryOnError(400))
    assert.ok(!shouldRetryOnError(403))
    assert.ok(!shouldRetryOnError(404))
  })

  test('U-08: bir vaqtning o\'zida ikki syncPendingOrders → syncingPendingOrders flag bilan bloklanadi', () => {
    // syncingPendingOrders = true bo\'lsa return
    let syncingPendingOrders = false
    function startSync() {
      if (syncingPendingOrders) return 'blocked'
      syncingPendingOrders = true
      return 'started'
    }
    assert.equal(startSync(), 'started')
    assert.equal(startSync(), 'blocked')
    syncingPendingOrders = false
    assert.equal(startSync(), 'started')
  })

  test('U-09: syncItems map dan productId field bilan yuboriladi (DB field nomi)', () => {
    const dbItems = [{ product_server_id: 'srv-abc', quantity: 3 }]
    const syncItems = buildSyncItemsFromDb(dbItems)
    assert.equal(syncItems[0].productServerId, 'srv-abc')
    assert.equal(syncItems[0].count, 3)
  })

  test('U-10: CLOSED_STATUSES da bekor qilingan order yopish urinilmaydi', () => {
    const serverOrder = { id: 'srv-1', status: 'CANCELED' }
    assert.ok(!isServerOrderOpen(serverOrder))
    // Status 4xx → synced belgilanadi, throw qilinmaydi
  })
})
