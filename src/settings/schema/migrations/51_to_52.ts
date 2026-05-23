import type { SettingMigration } from '../setting.types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * v51→v52: rename the ambiguous `toolType` field on chat models to
 * `builtinToolProvider` (it actually controls which provider's built-in /
 * hosted tools — e.g. web search — get injected into the request, not what
 * function-calling tools the agent runs). The old `gptTools` per-provider
 * config gets folded into a unified `builtinTools` object keyed by provider,
 * so new entries (e.g. `openrouter`) can sit alongside `gpt` without
 * proliferating top-level fields.
 *
 * No tool behavior changes — purely a rename + structural regroup.
 */
export const migrateFrom51To52: SettingMigration['migrate'] = (data) => {
  const next: Record<string, unknown> = { ...data, version: 52 }

  if (!Array.isArray(next.chatModels)) return next

  next.chatModels = next.chatModels.map((raw) => {
    if (!isRecord(raw)) return raw

    const updated: Record<string, unknown> = { ...raw }

    // toolType -> builtinToolProvider
    if ('toolType' in updated) {
      const v = updated.toolType
      if (typeof v === 'string' && ['none', 'gemini', 'gpt'].includes(v)) {
        updated.builtinToolProvider = v
      }
      delete updated.toolType
    }

    // gptTools -> builtinTools.gpt
    //
    // Tradeoff: if the user's on-disk data somehow already carries a
    // `builtinTools.gpt` (e.g. hand-edited config, cross-version sync replay,
    // or a draft from an experimental build) we OVERWRITE it with the legacy
    // `gptTools` value rather than merging. `gptTools` is the authoritative
    // v51 source; any pre-existing `builtinTools.gpt` at v51 is by definition
    // out-of-band data that the v51 schema doesn't recognize. We do preserve
    // sibling keys (e.g. `builtinTools.openrouter`) since those live in a
    // namespace that wouldn't conflict with the legacy field.
    if ('gptTools' in updated) {
      const v = updated.gptTools
      if (isRecord(v)) {
        const existing = isRecord(updated.builtinTools)
          ? updated.builtinTools
          : {}
        updated.builtinTools = { ...existing, gpt: v }
      }
      delete updated.gptTools
    }

    return updated
  })

  return next
}
