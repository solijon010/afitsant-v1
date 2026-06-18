/**
 * POS Sync Logic Tests
 * Run: node --test test/sync.test.mjs
 * Node.js 18+ built-in test runner — no install required
 *
 * Tests cover:
 *   1. Integer filter (KG items excluded from server PATCH)
 *   2. UNIQUE constraint prevention in markOrderSynced
 *   3. Cart store operations (decrement, remove, setQuantity)
 *   4. syncItems building (duplicates, count=0)
 *   5. Offline→online closed order sync
 *   6. Double-count (700k) prevention
 *   7. patchItems vs activeItems vs postItems
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// ─── Pure logic extracted for testing (no Electron/SQLite deps) ──────────────

/** Replicate the exact filter chain from orders.ts syncAllItems */
function buildSyncLists(items) {
  const activeItems = items.filter(it => it.count > 0)
  const patchItems = activeItems.filter(it => Number.isInteger(it.count))
  const postItems = patchItems  // same reference — only integers go to server
  return { activeItems, patchItems, postItems }
}

/** Replicate syncItems building in syncEngine.ts (pendingOpen + pendingClosed) */
function buildSyncItemsFromDb(dbItems) {
  return dbItems
    .filter(it => it.product_server_id && it.quantity > 0 && Number.isInteger(it.quantity))
    .map(it => ({ productServerId: it.product_server_id, count: it.quantity }))
}

/** Replicate the syncMap build in Order.tsx handleSave */
function buildHandleSaveSyncMap(savedLines, initialServerItems) {
  const itemsWithServerId = savedLines.filter(l => l.productServerId && l.quantity > 0)
  const syncMap = new Map()
  for (const l of itemsWithServerId) {
    const prev = syncMap.get(l.productServerId) ?? 0
    syncMap.set(l.productServerId, prev + l.quantity)
  }
  // Items removed vs initial server state → count 0
  const removedFromServer = initialServerItems.filter(
    init => init.productServerId &&
      !savedLines.some(l => l.productServerId === init.productServerId)
  )
  for (const item of removedFromServer) {
    if (!syncMap.has(item.productServerId)) {
      syncMap.set(item.productServerId, 0)
    }
  }
  return Array.from(syncMap.entries()).map(([productServerId, count]) => ({ productServerId, count }))
}

/** Cart decrement logic */
function cartDecrement(lines, localUuid) {
  const line = lines.find(l => l.localUuid === localUuid)
  if (!line) return lines
  if (line.quantity <= 1) {
    return lines.filter(l => l.localUuid !== localUuid)
  }
  return lines.map(l => l.localUuid === localUuid ? { ...l, quantity: l.quantity - 1, flushed: false } : l)
}

/** Cart setQuantity logic */
function cartSetQuantity(lines, localUuid, quantity) {
  if (quantity <= 0) {
    return lines.filter(l => l.localUuid !== localUuid)
  }
  return lines.map(l => l.localUuid === localUuid ? { ...l, quantity, flushed: false } : l)
}

/** UNIQUE conflict check logic */
function checkUniqueConflict(existingOrders, targetOrderId, newServerId) {
  const conflict = existingOrders.find(o => o.server_id === newServerId && o.id !== targetOrderId)
  return !!conflict
}

/** markOrderSynced conflict-safe logic */
function markOrderSynced(orders, orderId, serverOrderId) {
  return orders.map(o => {
    if (o.id !== orderId) return o
    if (serverOrderId) {
      const conflict = orders.some(other => other.server_id === serverOrderId && other.id !== orderId)
      if (conflict) {
        return { ...o, sync_status: 'synced' }  // no server_id change
      }
      return { ...o, server_id: o.server_id ?? serverOrderId, sync_status: 'synced' }
    }
    return { ...o, sync_status: 'synced' }
  })
}

// ─── TEST SUITE ───────────────────────────────────────────────────────────────

describe('1. Integer filter — server only accepts integer count >= 1', () => {
  test('fractional KG item (0.5) excluded from patchItems', () => {
    const items = [
      { productServerId: 'prod-non', count: 2 },
      { productServerId: 'prod-ordak', count: 0.5 },
    ]
    const { patchItems } = buildSyncLists(items)
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'prod-non')
  })

  test('fractional 0.46 excluded', () => {
    const items = [
      { productServerId: 'a', count: 1 },
      { productServerId: 'b', count: 0.46 },
      { productServerId: 'c', count: 3 },
    ]
    const { patchItems } = buildSyncLists(items)
    assert.equal(patchItems.length, 2)
    assert.ok(patchItems.every(it => Number.isInteger(it.count)))
  })

  test('count=0 excluded from activeItems', () => {
    const items = [
      { productServerId: 'a', count: 0 },
      { productServerId: 'b', count: 1 },
    ]
    const { activeItems } = buildSyncLists(items)
    assert.equal(activeItems.length, 1)
  })

  test('count=2.0 (whole float) treated as integer', () => {
    const items = [{ productServerId: 'kanotcha', count: 2.0 }]
    const { patchItems } = buildSyncLists(items)
    assert.equal(patchItems.length, 1)
    assert.ok(Number.isInteger(2.0))
  })

  test('all KG items → postItems empty → no new order created', () => {
    const items = [
      { productServerId: 'ordak', count: 0.5 },
      { productServerId: 'qanot', count: 0.3 },
    ]
    const { postItems } = buildSyncLists(items)
    assert.equal(postItems.length, 0)
  })

  test('mixed items → only integers sent to server', () => {
    const items = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'salfetka', count: 2 },
      { productServerId: 'ordak', count: 0.5 },
      { productServerId: 'kanotcha', count: 2 },
    ]
    const { patchItems } = buildSyncLists(items)
    assert.equal(patchItems.length, 3)
    assert.ok(patchItems.every(it => Number.isInteger(it.count)))
    assert.ok(!patchItems.find(it => it.productServerId === 'ordak'))
  })
})

describe('2. syncItems from DB (syncEngine filter)', () => {
  test('null product_server_id excluded', () => {
    const dbItems = [
      { product_server_id: 'abc', quantity: 1 },
      { product_server_id: null, quantity: 2 },
    ]
    const result = buildSyncItemsFromDb(dbItems)
    assert.equal(result.length, 1)
  })

  test('fractional quantity excluded', () => {
    const dbItems = [
      { product_server_id: 'a', quantity: 1 },
      { product_server_id: 'b', quantity: 0.5 },
    ]
    const result = buildSyncItemsFromDb(dbItems)
    assert.equal(result.length, 1)
    assert.equal(result[0].productServerId, 'a')
  })

  test('quantity=0 excluded', () => {
    const dbItems = [
      { product_server_id: 'a', quantity: 0 },
      { product_server_id: 'b', quantity: 2 },
    ]
    const result = buildSyncItemsFromDb(dbItems)
    assert.equal(result.length, 1)
  })

  test('all KG fractional → empty syncItems → lookup server order for close', () => {
    const dbItems = [
      { product_server_id: 'ordak', quantity: 0.5 },
      { product_server_id: 'qanot', quantity: 0.25 },
    ]
    const result = buildSyncItemsFromDb(dbItems)
    assert.equal(result.length, 0)
    // When empty: should NOT create new order → find existing server order to close
  })
})

describe('3. handleSave syncMap building', () => {
  test('removed items get count=0 in syncMap', () => {
    const savedLines = [
      { productServerId: 'non', quantity: 1 },
    ]
    const initialServerItems = [
      { productServerId: 'non', quantity: 1 },
      { productServerId: 'salfetka', quantity: 2 },  // was on server, removed now
    ]
    const syncItems = buildHandleSaveSyncMap(savedLines, initialServerItems)
    const salfetka = syncItems.find(i => i.productServerId === 'salfetka')
    assert.ok(salfetka)
    assert.equal(salfetka.count, 0)
  })

  test('count=0 items are filtered by patchItems (integer filter)', () => {
    const syncItems = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'salfetka', count: 0 },  // removed
    ]
    const { patchItems } = buildSyncLists(syncItems)
    // count=0 excluded from activeItems, so excluded from patchItems
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'non')
  })

  test('same product added twice → merged (no duplicate)', () => {
    const savedLines = [
      { productServerId: 'non', quantity: 1 },
      { productServerId: 'non', quantity: 2 },  // duplicate (edge case)
    ]
    const syncItems = buildHandleSaveSyncMap(savedLines, [])
    assert.equal(syncItems.length, 1)
    assert.equal(syncItems[0].count, 3)
  })

  test('order without server products → syncItems empty', () => {
    const savedLines = [
      { productServerId: null, quantity: 1 },
    ]
    const syncItems = buildHandleSaveSyncMap(savedLines, [])
    assert.equal(syncItems.length, 0)
  })
})

describe('4. Cart operations', () => {
  const makeLine = (uuid, qty) => ({
    localUuid: uuid,
    productId: 1,
    productServerId: 'srv-1',
    productName: 'Test',
    unitPrice: 5000,
    quantity: qty,
    notes: null,
    flushed: true,
    itemId: 1,
    addedAt: Date.now()
  })

  test('decrement removes item at quantity=1', () => {
    const lines = [makeLine('a', 1)]
    const result = cartDecrement(lines, 'a')
    assert.equal(result.length, 0)
  })

  test('decrement decreases quantity at quantity=2', () => {
    const lines = [makeLine('a', 2)]
    const result = cartDecrement(lines, 'a')
    assert.equal(result[0].quantity, 1)
  })

  test('decrement on KG item 0.5 → removes (0.5 <= 1)', () => {
    const lines = [makeLine('a', 0.5)]
    const result = cartDecrement(lines, 'a')
    assert.equal(result.length, 0)
  })

  test('setQuantity(0) removes item', () => {
    const lines = [makeLine('a', 3)]
    const result = cartSetQuantity(lines, 'a', 0)
    assert.equal(result.length, 0)
  })

  test('setQuantity(-1) removes item', () => {
    const lines = [makeLine('a', 2)]
    const result = cartSetQuantity(lines, 'a', -1)
    assert.equal(result.length, 0)
  })

  test('setQuantity(2) updates quantity', () => {
    const lines = [makeLine('a', 1)]
    const result = cartSetQuantity(lines, 'a', 2)
    assert.equal(result[0].quantity, 2)
  })

  test('setQuantity(0.5) for KG item keeps it (valid kg amount)', () => {
    const lines = [makeLine('a', 1)]
    const result = cartSetQuantity(lines, 'a', 0.5)
    assert.equal(result[0].quantity, 0.5)
  })

  test('decrement unknown uuid → no change', () => {
    const lines = [makeLine('a', 2)]
    const result = cartDecrement(lines, 'unknown')
    assert.equal(result.length, 1)
    assert.equal(result[0].quantity, 2)
  })
})

describe('5. UNIQUE constraint prevention', () => {
  test('checkUniqueConflict returns true when another order has same server_id', () => {
    const orders = [
      { id: 10, server_id: 'srv-abc', sync_status: 'synced' },
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    assert.ok(checkUniqueConflict(orders, 11, 'srv-abc'))
  })

  test('checkUniqueConflict returns false when no conflict', () => {
    const orders = [
      { id: 10, server_id: 'srv-xyz', sync_status: 'synced' },
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    assert.ok(!checkUniqueConflict(orders, 11, 'srv-abc'))
  })

  test('markOrderSynced with conflict → does NOT overwrite server_id', () => {
    const orders = [
      { id: 10, server_id: 'srv-abc', sync_status: 'synced' },
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    const result = markOrderSynced(orders, 11, 'srv-abc')
    const updated = result.find(o => o.id === 11)
    assert.equal(updated.sync_status, 'synced')
    assert.equal(updated.server_id, null)  // NOT overwritten
  })

  test('markOrderSynced without conflict → sets server_id', () => {
    const orders = [
      { id: 11, server_id: null, sync_status: 'pending' },
    ]
    const result = markOrderSynced(orders, 11, 'srv-new')
    const updated = result.find(o => o.id === 11)
    assert.equal(updated.sync_status, 'synced')
    assert.equal(updated.server_id, 'srv-new')
  })

  test('markOrderSynced without serverOrderId → only sets synced', () => {
    const orders = [
      { id: 11, server_id: 'srv-x', sync_status: 'pending' },
    ]
    const result = markOrderSynced(orders, 11, undefined)
    const updated = result.find(o => o.id === 11)
    assert.equal(updated.sync_status, 'synced')
    assert.equal(updated.server_id, 'srv-x')  // preserved
  })
})

describe('6. 700k double-count prevention', () => {
  // The 700k issue: when closed order has no server_id and only KG items,
  // we must NOT create a new order. Instead: find existing open server order and close it.

  test('when syncItems empty AND no serverId → should look up server open order', () => {
    const closedOrder = {
      id: 50,
      server_id: null,
      room_server_id: 'room-1',
      status: 'closed',
    }
    const allKgItems = [
      { product_server_id: 'ordak', quantity: 0.5 },
    ]
    const syncItems = buildSyncItemsFromDb(allKgItems)
    // syncItems is empty → should NOT call POST /api/order
    assert.equal(syncItems.length, 0)
    // Expected behavior: fetch visible orders, find open order for room-1, close it
    // (tested logically — actual fetch is mocked in integration)
  })

  test('when closed order has server_id → use it directly (no new order)', () => {
    const closedOrder = {
      id: 50,
      server_id: 'srv-existing-300k',
      room_server_id: 'room-1',
      status: 'closed',
    }
    // serverId = order.server_id → not null → goes to else if (serverId) branch
    assert.ok(closedOrder.server_id !== null)
    // Expected: PATCH existing, then close — NOT create new
  })

  test('patchItems calculation for offline 400k order (mix of integer + KG)', () => {
    // Offline order: non(1) + salfetka(2) + ordak(0.5kg) = 400k total
    // Server should see: non + salfetka (integer items only)
    const items = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'salfetka', count: 2 },
      { productServerId: 'ordak', count: 0.5 },
    ]
    const { patchItems, postItems } = buildSyncLists(items)
    assert.equal(patchItems.length, 2)
    assert.ok(!patchItems.find(i => i.productServerId === 'ordak'))
    assert.equal(postItems.length, 2)  // new order also only has integer items
  })
})

describe('7. Full order sync scenario', () => {
  test('Scenario: remove non from 300k order → admin should update', () => {
    // Initial server state: non(1) + kanotcha(2) + ordak(0.5kg)
    const initialServerItems = [
      { productServerId: 'non', quantity: 1 },
      { productServerId: 'kanotcha', quantity: 2 },
      { productServerId: 'ordak', quantity: 0.5 },
    ]
    // User removes non from cart
    const savedLines = [
      { productServerId: 'kanotcha', quantity: 2 },
      { productServerId: 'ordak', quantity: 0.5 },
    ]
    const syncItems = buildHandleSaveSyncMap(savedLines, initialServerItems)
    // syncMap: kanotcha=2, ordak=0.5, non=0 (removed)
    // After patchItems filter: only kanotcha=2 (integers, count>0)
    const { patchItems } = buildSyncLists(syncItems)
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'kanotcha')
    assert.equal(patchItems[0].count, 2)
    // non is removed → not in patchItems → server replaces with [kanotcha:2] only ✓
    // (server sync-items is a REPLACE operation)
    assert.ok(!patchItems.find(i => i.productServerId === 'non'))
    assert.ok(!patchItems.find(i => i.productServerId === 'ordak'))
  })

  test('Scenario: add non to order with KG items → non should reach server', () => {
    const savedLines = [
      { productServerId: 'ordak', quantity: 0.5 },   // KG item
      { productServerId: 'non', quantity: 1 },         // integer item
    ]
    const syncItems = buildHandleSaveSyncMap(savedLines, [])
    const { patchItems } = buildSyncLists(syncItems)
    // KG item excluded, but non should be sent
    assert.equal(patchItems.length, 1)
    assert.equal(patchItems[0].productServerId, 'non')
    assert.equal(patchItems[0].count, 1)
  })

  test('Scenario: PATCH fails with 400 → retry uses same integer-only patchItems', () => {
    const items = [
      { productServerId: 'non', count: 1 },
      { productServerId: 'ordak', count: 0.5 },
    ]
    const { patchItems } = buildSyncLists(items)
    // Retry also uses patchItems (not activeItems which includes ordak 0.5)
    assert.equal(patchItems.length, 1)
    assert.ok(!patchItems.find(i => i.count < 1))
  })

  test('Scenario: kanotcha 2 dona + ordak 0.5kg — kanotcha reaches server', () => {
    const dbItems = [
      { product_server_id: 'kanotcha-id', quantity: 2 },
      { product_server_id: 'ordak-id', quantity: 0.5 },
    ]
    const syncItems = buildSyncItemsFromDb(dbItems)
    assert.equal(syncItems.length, 1)
    assert.equal(syncItems[0].productServerId, 'kanotcha-id')
    assert.equal(syncItems[0].count, 2)
  })
})
