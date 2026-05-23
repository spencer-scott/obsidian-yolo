// React hook for subscribing to external CLI streaming events
// First backfill history via getSnapshot, then subscribe to subsequent pushes; 50ms throttle to avoid setState per chunk

import { App } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ExternalCliSnapshot } from '../core/agent/external-cli/streamBus'
import { externalCliStreamBus } from '../core/agent/external-cli/streamBus'
import { loadExternalAgentProgress } from '../database/json/chat/externalAgentProgressStore'
import type { YoloSettings } from '../settings/schema/setting.types'

const THROTTLE_MS = 50

export type ExternalCliViewSnapshot =
  | (ExternalCliSnapshot & { source: 'live' })
  | {
      stderr: string
      stdout: ''
      status: 'done'
      source: 'historical'
      truncated?: { totalBytes: number; omittedBytes: number }
    }

/**
 * Subscribe to streaming output for a given toolCallId, with support for loading progress logs from disk cache for historical conversations.
 *
 * Return semantics:
 * - `null`  -> historical conversation with no disk cache, should use static render path
 * - source === 'live'       -> currently running or finished live snapshot
 * - source === 'historical' -> historical conversation, progress logs loaded from disk cache
 */
export function useExternalCliStream(
  toolCallId: string,
  opts: { app: App; settings?: YoloSettings },
): ExternalCliViewSnapshot | null {
  const { app, settings } = opts

  const [snapshot, setSnapshot] = useState<ExternalCliViewSnapshot | null>(
    () => {
      const live = externalCliStreamBus.getSnapshot(toolCallId)
      if (live !== null) return { ...live, source: 'live' }
      return null
    },
  )

  // Throttle timer ref
  const pendingRef = useRef<ExternalCliSnapshot | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    timerRef.current = null
    if (pendingRef.current !== null) {
      setSnapshot({ ...pendingRef.current, source: 'live' })
      pendingRef.current = null
    }
  }, [])

  useEffect(() => {
    // stale guard: prevents async load from updating state after unmount or toolCallId change
    let cancelled = false

    pendingRef.current = null
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const initial = externalCliStreamBus.getSnapshot(toolCallId)
    if (initial !== null) {
      setSnapshot({ ...initial, source: 'live' })
    } else {
      setSnapshot(null)
      // Historical conversation: asynchronously load progress logs from disk cache
      void loadExternalAgentProgress({ app, settings, toolCallId })
        .then((stored) => {
          if (cancelled) return
          // Guard: if a live snapshot appeared on the bus by the time load completes, let the subscribe callback drive state instead of overwriting with historical data
          if (externalCliStreamBus.getSnapshot(toolCallId) !== null) return
          if (!stored) return
          setSnapshot({
            stderr: stored.progressText,
            stdout: '',
            status: 'done',
            source: 'historical',
            ...(stored.truncated ? { truncated: stored.truncated } : {}),
          })
        })
        .catch(() => {
          // On load failure, keep null
        })
    }

    // Always subscribe: even without an initial snapshot, the runner may push later (guards against historical-to-live edge-case race)
    const unsubscribe = externalCliStreamBus.subscribe(toolCallId, () => {
      pendingRef.current = externalCliStreamBus.getSnapshot(toolCallId)
      if (!timerRef.current) {
        timerRef.current = setTimeout(flush, THROTTLE_MS)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [toolCallId, app, settings, flush])

  return snapshot
}
