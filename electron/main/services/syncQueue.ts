import { getDb } from '../db/connection'
import type { SyncAction } from '@shared/types'

export interface QueueItem {
  id: number
  entity: string
  entityId: number
  action: SyncAction
  payload: any
  attempts: number
  lastError: string | null
  createdAt: number
  nextAttemptAt: number
}

export function enqueue(entity: string, entityId: number, action: SyncAction, payload: any, delayMs = 0): void {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO sync_queue (entity, entity_id, action, payload, attempts, created_at, next_attempt_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    )
    .run(entity, entityId, action, JSON.stringify(payload ?? null), now, now + delayMs)
}

export function dequeueBatch(limit: number, now = Date.now()): QueueItem[] {
  const rows = getDb()
    .prepare(`SELECT * FROM sync_queue WHERE next_attempt_at <= ? ORDER BY id ASC LIMIT ?`)
    .all(now, limit) as any[]
  return rows.map((r) => ({
    id: r.id,
    entity: r.entity,
    entityId: r.entity_id,
    action: r.action,
    payload: r.payload ? JSON.parse(r.payload) : null,
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: r.created_at,
    nextAttemptAt: r.next_attempt_at
  }))
}

export function markDone(ids: number[]): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  getDb().prepare(`DELETE FROM sync_queue WHERE id IN (${placeholders})`).run(...ids)
}

export function markFailed(id: number, error: string, backoffMs: number): void {
  getDb()
    .prepare(
      `UPDATE sync_queue SET attempts = attempts + 1, last_error = ?, next_attempt_at = ? WHERE id = ?`
    )
    .run(error, Date.now() + backoffMs, id)
}

export function queuedCount(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS c FROM sync_queue`).get() as { c: number }).c
}
