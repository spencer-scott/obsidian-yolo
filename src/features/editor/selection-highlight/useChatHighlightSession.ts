import { type RefObject, useEffect, useMemo, useRef } from 'react'

import type { Mentionable } from '../../../types/mentionable'

import { pdfSelectionHighlightController } from './pdfSelectionHighlightController'
import { selectionHighlightController } from './selectionHighlightController'

type UseChatHighlightSessionArgs = {
  conversationId: string
  containerRef: RefObject<HTMLElement | null>
  /** Mentionables currently in the input box. */
  inputMentionables: Mentionable[]
  /**
   * Mentionables on the historical user message being edited in place, or
   * `null` when the input box itself has focus.
   */
  focusedHistoricalMentionables: Mentionable[] | null
}

/**
 * Editor leaf surfaces that count as "user interacted with a real editor" and
 * therefore end the current sticky cycle.  Includes both the markdown CM
 * editor and Obsidian's built-in PDF viewer.
 */
const EDITOR_LEAF_SELECTOR =
  '.workspace-leaf-content[data-type="markdown"], .workspace-leaf-content[data-type="pdf"]'

/**
 * Collect the runtime highlightIds carried by selection-style block
 * mentionables.  Highlights only get a runtime id when they were created in
 * the current process via `addHighlight`; mentions deserialized from disk
 * never carry one, so this is safe to call on chat history without surfacing
 * ghost ids across restarts.
 */
function collectHighlightIds(mentionables: Mentionable[]): Set<string> {
  const ids = new Set<string>()
  for (const m of mentionables) {
    if (m.type !== 'block') continue
    if (
      m.source !== 'selection' &&
      m.source !== 'selection-sync' &&
      m.source !== 'selection-pinned'
    ) {
      continue
    }
    if (m.highlightId) ids.add(m.highlightId)
  }
  return ids
}

function dispatchReconcile(activeIds: Set<string>): void {
  selectionHighlightController.reconcileActiveIds(activeIds)
  pdfSelectionHighlightController.reconcileActiveIds(activeIds)
}

/**
 * Owns the "sticky" lifecycle for chat-owned selection highlights.
 *
 * Background: each chat highlight is registered with the singleton highlight
 * controller via `addHighlight(view, id, ..., owner: 'chat')` when the user
 * creates a selection-style mentionable.  The controller's
 * `reconcileActiveIds(ids)` deletes every chat-owned entry whose id is NOT in
 * `ids`, so whoever drives reconcile decides the visible set.
 *
 * This hook unifies the lifecycle:
 *
 * - On every render, `liveIds` are recomputed from the input box plus the
 *   historical user message currently being edited in place.  Live ids are
 *   merged into a session-scoped sticky set, then reconcile is dispatched
 *   with `liveIds ∪ sticky`.  As a result a highlight survives sending the
 *   user message — the id leaves the input box but remains in sticky.
 *
 * - First `pointerdown` / `focusin` on any markdown / pdf workspace leaf
 *   outside the chat view container resets the sticky set to the current
 *   live ids and reconciles immediately.  This drops every previously
 *   accumulated highlight, while keeping any unsent mention that still sits
 *   in the input box.  The next mention the user creates begins a fresh
 *   sticky cycle — the lifecycle is loop-shaped, not one-shot.
 *
 * - When `conversationId` changes (load another conversation, new chat, …)
 *   the sticky set is wiped and reconcile is dispatched with an empty set,
 *   so all chat-owned highlights disappear immediately rather than waiting
 *   for the next render of the new conversation.
 *
 * - On unmount the sticky set is wiped the same way.
 */
export function useChatHighlightSession({
  conversationId,
  containerRef,
  inputMentionables,
  focusedHistoricalMentionables,
}: UseChatHighlightSessionArgs): void {
  // Compute live ids.  Memoised on a content key so that downstream effects
  // only re-run when the actual id set changes — not on every parent render.
  const liveIds = useMemo(() => {
    const ids = collectHighlightIds(inputMentionables)
    if (focusedHistoricalMentionables) {
      for (const id of collectHighlightIds(focusedHistoricalMentionables)) {
        ids.add(id)
      }
    }
    return ids
  }, [inputMentionables, focusedHistoricalMentionables])

  const liveIdsKey = useMemo(
    () => Array.from(liveIds).sort().join('|'),
    [liveIds],
  )

  const stickyIdsRef = useRef<Set<string>>(new Set())
  const liveIdsRef = useRef<Set<string>>(liveIds)
  liveIdsRef.current = liveIds

  // IMPORTANT: the conversation reset effect must run BEFORE the live merge
  // effect on a render where both fire (mount, conversation switch).  React
  // runs passive effects in declaration order, so this one is declared first;
  // the live merge effect below also depends on `conversationId`, so it
  // re-seeds sticky from the current live ids right after the reset.
  //
  // Without this ordering, opening / switching into a conversation that
  // already has live mentions in the input would briefly install the
  // highlights and then the conversation effect would wipe them.
  useEffect(() => {
    stickyIdsRef.current = new Set()
    dispatchReconcile(new Set())
  }, [conversationId])

  // Reconcile whenever the live set or conversation changes: merge live ids
  // into sticky and dispatch the union.
  useEffect(() => {
    const merged = new Set(stickyIdsRef.current)
    for (const id of liveIdsRef.current) merged.add(id)
    stickyIdsRef.current = merged
    dispatchReconcile(merged)
  }, [conversationId, liveIdsKey])

  // First interaction with any real editor (CM or PDF) outside the chat
  // container ends the current sticky cycle.  Listeners stay installed for
  // the lifetime of the chat view: every subsequent batch of mentions enters
  // a new sticky cycle and likewise clears on the next editor interaction.
  useEffect(() => {
    const handle = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const container = containerRef.current
      if (container && container.contains(target)) return
      if (!target.closest(EDITOR_LEAF_SELECTOR)) return
      // Reset sticky to the current live ids.  Anything that lived purely in
      // sticky (sent mentions) drops out; anything still in the input box
      // remains visible and seeds the next cycle.
      const liveOnly = new Set(liveIdsRef.current)
      stickyIdsRef.current = liveOnly
      dispatchReconcile(liveOnly)
    }
    document.addEventListener('pointerdown', handle, true)
    document.addEventListener('focusin', handle, true)
    return () => {
      document.removeEventListener('pointerdown', handle, true)
      document.removeEventListener('focusin', handle, true)
    }
  }, [containerRef])

  // Unmount: same cleanup as a conversation switch, so closing the chat view
  // never leaves stale highlights behind.
  useEffect(() => {
    return () => {
      stickyIdsRef.current = new Set()
      dispatchReconcile(new Set())
    }
  }, [])
}
