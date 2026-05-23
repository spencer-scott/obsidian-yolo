import type { SettingMigration } from '../setting.types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * v57→v58: when a chat model belongs to an OpenRouter provider, its
 * `builtinToolProvider` is constrained to `none` or `openrouter` — other
 * families (`gemini` / `gpt` / `grok`) have no path through OpenRouter's
 * OpenAI-compatible request body and were silently dropped at request time.
 * Reset incompatible legacy values so the UI and the wire match.
 */
export const migrateFrom57To58: SettingMigration['migrate'] = (data) => {
  const next: Record<string, unknown> = { ...data, version: 58 }

  if (!Array.isArray(next.providers) || !Array.isArray(next.chatModels)) {
    return next
  }

  const openRouterProviderIds = new Set<string>()
  for (const provider of next.providers) {
    if (!isRecord(provider)) continue
    const presetType = provider.presetType ?? provider.type
    if (presetType === 'openrouter' && typeof provider.id === 'string') {
      openRouterProviderIds.add(provider.id)
    }
  }

  if (openRouterProviderIds.size === 0) return next

  next.chatModels = next.chatModels.map((raw) => {
    if (!isRecord(raw)) return raw
    if (typeof raw.providerId !== 'string') return raw
    if (!openRouterProviderIds.has(raw.providerId)) return raw

    const current = raw.builtinToolProvider
    if (current === 'gemini' || current === 'gpt' || current === 'grok') {
      return { ...raw, builtinToolProvider: 'none' }
    }
    return raw
  })

  return next
}
