import { useEffect, useRef, useState } from 'react'

import {
  ContextBreakdown,
  estimateContextBreakdown,
} from '../../core/agent/contextBreakdown'

export type ContextBreakdownInputs = Parameters<
  typeof estimateContextBreakdown
>[0]

export type ContextBreakdownState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: ContextBreakdown }
  | { status: 'error'; error: string }

/**
 * Trigger a context-breakdown estimation when `open` flips to true.
 *
 * Stale-safe with respect to **open/close cycles**: if the user closes the
 * popover before the async estimate resolves, the result is discarded. The
 * hook does NOT react to in-flight input changes while the popover stays
 * open — the snapshot used is whatever `buildInputs()` returned at the moment
 * `open` transitioned to true. This matches Cursor's behavior (estimate once
 * per open) and avoids re-tokenizing on every keystroke.
 *
 * Inputs are passed as a thunk so callers don't have to memoize a heavy
 * object structure; the hook only invokes the thunk when an estimation is
 * actually needed.
 */
export const useContextBreakdown = (
  open: boolean,
  buildInputs: () =>
    | ContextBreakdownInputs
    | null
    | Promise<ContextBreakdownInputs | null>,
): ContextBreakdownState => {
  const [state, setState] = useState<ContextBreakdownState>({ status: 'idle' })
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!open) {
      // Reset to idle on close so the next open shows skeleton, not stale data.
      setState({ status: 'idle' })
      requestIdRef.current += 1
      return
    }

    requestIdRef.current += 1
    const currentRequestId = requestIdRef.current
    setState({ status: 'loading' })

    let cancelled = false
    void (async () => {
      try {
        const inputs = await buildInputs()
        if (cancelled || requestIdRef.current !== currentRequestId) {
          return
        }
        if (!inputs) {
          setState({ status: 'error', error: 'missing-inputs' })
          return
        }
        const result = await estimateContextBreakdown(inputs)
        if (cancelled || requestIdRef.current !== currentRequestId) {
          return
        }
        setState({ status: 'ready', data: result })
      } catch (error) {
        if (cancelled || requestIdRef.current !== currentRequestId) {
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[YOLO] context breakdown estimation failed', error)
        setState({ status: 'error', error: message })
      }
    })()

    return () => {
      cancelled = true
    }
    // We intentionally rerun whenever `open` flips. `buildInputs` is a thunk
    // that closes over current state; calling it once per open captures the
    // snapshot we want. If we need a manual refresh while open we'd add an
    // explicit `revision` dep, but the popover currently estimates once per
    // open which matches Cursor's behavior.
  }, [open])

  return state
}
