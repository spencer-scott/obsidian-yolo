// External CLI streaming event bus
// The runner pushes events; frontend hooks subscribe to new events and use getSnapshot to catch up on history

import type { AsyncTaskRecord } from './async-task-registry'

/** Maximum character count for stdout/stderr in the snapshot (truncated from the front when exceeded) */
const SNAPSHOT_MAX_CHARS = 1 * 1024 * 1024 // 1MB chars
const SNAPSHOT_TRUNCATION_MARKER = '... [front truncated] ...\n'

export type ExternalCliStatus = 'starting' | 'running' | 'done'

export type ExternalCliEvent =
  | { type: 'stdout'; toolCallId: string; chunk: string; ts: number }
  | { type: 'stderr'; toolCallId: string; chunk: string; ts: number }
  | { type: 'status'; toolCallId: string; status: ExternalCliStatus }
  | {
      type: 'task-completed'
      taskId: string
      conversationId: string
      record: AsyncTaskRecord
    }

export type ExternalCliSnapshot = {
  stdout: string
  stderr: string
  status: ExternalCliStatus
}

type Subscriber = (event: ExternalCliEvent) => void

/**
 * Cap a snapshot string to SNAPSHOT_MAX_CHARS.
 * When exceeded, truncate from the front and insert a marker to prevent
 * unbounded snapshot growth. JS strings are valid UTF-16, so no UTF-8
 * boundary handling is needed.
 */
function cappedSnapshotString(s: string): string {
  if (s.length <= SNAPSHOT_MAX_CHARS) return s
  return SNAPSHOT_TRUNCATION_MARKER + s.slice(s.length - SNAPSHOT_MAX_CHARS)
}

type TaskCompletedSubscriber = (
  event: Extract<ExternalCliEvent, { type: 'task-completed' }>,
) => void

export class ExternalCliStreamBus {
  private readonly snapshots = new Map<string, ExternalCliSnapshot>()
  private readonly subscribers = new Map<string, Set<Subscriber>>()
  private readonly taskCompletedSubscribers = new Set<TaskCompletedSubscriber>()

  /** Subscribe to subsequent events for a given toolCallId; returns an unsubscribe function */
  subscribe(toolCallId: string, fn: Subscriber): () => void {
    let subs = this.subscribers.get(toolCallId)
    if (!subs) {
      subs = new Set()
      this.subscribers.set(toolCallId, subs)
    }
    subs.add(fn)
    return () => {
      subs?.delete(fn)
      if (subs?.size === 0) {
        this.subscribers.delete(toolCallId)
      }
    }
  }

  /** Subscribe to all task-completed events (for ChatStore) */
  subscribeTaskCompleted(fn: TaskCompletedSubscriber): () => void {
    this.taskCompletedSubscribers.add(fn)
    return () => {
      this.taskCompletedSubscribers.delete(fn)
    }
  }

  /** Runner pushes events; also updates the in-memory snapshot */
  push(event: ExternalCliEvent): void {
    if (event.type === 'task-completed') {
      for (const fn of this.taskCompletedSubscribers) {
        fn(event)
      }
      return
    }

    const { toolCallId } = event
    const snap = this.snapshots.get(toolCallId) ?? {
      stdout: '',
      stderr: '',
      status: 'starting' as const,
    }

    if (event.type === 'stdout') {
      const combined = snap.stdout + event.chunk
      this.snapshots.set(toolCallId, {
        ...snap,
        stdout: cappedSnapshotString(combined),
      })
    } else if (event.type === 'stderr') {
      const combined = snap.stderr + event.chunk
      this.snapshots.set(toolCallId, {
        ...snap,
        stderr: cappedSnapshotString(combined),
      })
    } else if (event.type === 'status') {
      this.snapshots.set(toolCallId, { ...snap, status: event.status })
    }

    const subs = this.subscribers.get(toolCallId)
    if (subs) {
      for (const fn of subs) {
        fn(event)
      }
    }
  }

  /**
   * Get the current snapshot (for late subscribers to catch up on history).
   * Returns null if the toolCallId was never registered (i.e., a historical
   * session using the static rendering path).
   */
  getSnapshot(toolCallId: string): ExternalCliSnapshot | null {
    return this.snapshots.get(toolCallId) ?? null
  }

  /** Clean up the in-memory snapshot after the process ends (optional, to avoid long-term memory usage) */
  clearSnapshot(toolCallId: string): void {
    this.snapshots.delete(toolCallId)
    this.subscribers.delete(toolCallId)
  }
}

// Singleton: unique for the entire plugin lifecycle
export const externalCliStreamBus = new ExternalCliStreamBus()
