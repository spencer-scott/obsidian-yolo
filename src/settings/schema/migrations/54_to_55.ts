import { PROVIDER_TYPES_INFO } from '../../../constants'
import { SettingMigration } from '../setting.types'

/**
 * v54→v55: register the new Xiaomi MiMo default provider and its five chat
 * models (`mimo-v2.5-pro`, `mimo-v2.5`, `mimo-v2-pro`, `mimo-v2-omni`,
 * `mimo-v2-flash`) so existing users get them on upgrade instead of having
 * to add the provider manually.
 *
 * Mirrors the additive shape of older provider-introduction migrations
 * (e.g. 2_to_3): existing entries with the same id keep user-set fields,
 * only filling in the new preset metadata; missing entries are appended.
 */

type ProviderRecord = {
  id: string
  presetType?: string
  apiType?: string
  [key: string]: unknown
}

type ChatModelRecord = {
  id: string
  providerId: string
  model: string
  [key: string]: unknown
}

const XIAOMIMIMO_PROVIDER_ID = PROVIDER_TYPES_INFO.xiaomimimo.defaultProviderId

const NEW_PROVIDER: ProviderRecord = {
  id: XIAOMIMIMO_PROVIDER_ID,
  presetType: 'xiaomimimo',
  apiType: 'openai-compatible',
}

const NEW_CHAT_MODELS: ChatModelRecord[] = [
  {
    providerId: XIAOMIMIMO_PROVIDER_ID,
    id: 'xiaomimimo/mimo-v2.5-pro',
    model: 'mimo-v2.5-pro',
    enable: false,
    reasoningType: 'openai',
  },
  {
    providerId: XIAOMIMIMO_PROVIDER_ID,
    id: 'xiaomimimo/mimo-v2.5',
    model: 'mimo-v2.5',
    enable: false,
    reasoningType: 'openai',
  },
  {
    providerId: XIAOMIMIMO_PROVIDER_ID,
    id: 'xiaomimimo/mimo-v2-pro',
    model: 'mimo-v2-pro',
    enable: false,
    reasoningType: 'openai',
  },
  {
    providerId: XIAOMIMIMO_PROVIDER_ID,
    id: 'xiaomimimo/mimo-v2-omni',
    model: 'mimo-v2-omni',
    enable: false,
    reasoningType: 'openai',
  },
  {
    providerId: XIAOMIMIMO_PROVIDER_ID,
    id: 'xiaomimimo/mimo-v2-flash',
    model: 'mimo-v2-flash',
    enable: false,
    reasoningType: 'openai',
  },
]

export const migrateFrom54To55: SettingMigration['migrate'] = (data) => {
  const newData = { ...data, version: 55 }

  if ('providers' in newData && Array.isArray(newData.providers)) {
    const existing = newData.providers.find(
      (p: ProviderRecord) => p?.id === NEW_PROVIDER.id,
    )
    if (!existing) {
      newData.providers.push({ ...NEW_PROVIDER })
    }
  }

  if ('chatModels' in newData && Array.isArray(newData.chatModels)) {
    const existingIds = new Set(
      (newData.chatModels as ChatModelRecord[]).map((m) => m?.id),
    )
    for (const model of NEW_CHAT_MODELS) {
      if (!existingIds.has(model.id)) {
        newData.chatModels.push({ ...model })
      }
    }
  }

  return newData
}
