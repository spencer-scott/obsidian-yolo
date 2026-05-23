import type { SettingMigration } from '../setting.types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

type ApiType =
  | 'openai-compatible'
  | 'openai-responses'
  | 'anthropic'
  | 'gemini'
  | 'amazon-bedrock'

/**
 * v50→v51: backfill the `pdf` input modality on chat models whose provider
 * uses the official Anthropic or Gemini API surface — both support native PDF
 * document input. Anthropic-/Gemini-compatible third-party proxies (OpenRouter,
 * MiniMax, GLM, etc.) typically register as `openai-compatible` here, so they
 * are intentionally excluded — users opt them in by hand if their proxy
 * forwards the document content block.
 *
 * No-op for models that already opted in to the `pdf` modality and for models
 * with no recognized provider apiType.
 */
export const migrateFrom50To51: SettingMigration['migrate'] = (data) => {
  const next: Record<string, unknown> = { ...data, version: 51 }

  if (!Array.isArray(next.chatModels)) return next

  const providerApiTypeById = new Map<string, ApiType>()
  if (Array.isArray(next.providers)) {
    for (const entry of next.providers) {
      if (!isRecord(entry)) continue
      const id = typeof entry.id === 'string' ? entry.id : null
      const apiType =
        typeof entry.apiType === 'string'
          ? (entry.apiType as ApiType)
          : undefined
      if (id && apiType) providerApiTypeById.set(id, apiType)
    }
  }

  next.chatModels = next.chatModels.map((raw) => {
    if (!isRecord(raw)) return raw

    const providerId =
      typeof raw.providerId === 'string' ? raw.providerId : null
    const apiType = providerId ? providerApiTypeById.get(providerId) : undefined
    if (apiType !== 'anthropic' && apiType !== 'gemini') return raw

    const existing = Array.isArray(raw.modalities)
      ? raw.modalities.filter((m): m is string => typeof m === 'string')
      : []
    if (existing.includes('pdf')) return raw

    // Preserve any user customizations (e.g. they removed 'vision'). Just append 'pdf'.
    const baseline = existing.length > 0 ? existing : ['text', 'vision']
    return { ...raw, modalities: [...baseline, 'pdf'] }
  })

  return next
}
