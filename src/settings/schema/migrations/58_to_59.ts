import type { SettingMigration } from '../setting.types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * v58→v59: add `ribbonClickAction` so users can choose where the ribbon icon
 * opens the Chat view (sidebar / tab / split / window / last). Default to
 * `'sidebar'` to preserve existing behavior.
 */
export const migrateFrom58To59: SettingMigration['migrate'] = (data) => {
  const next: Record<string, unknown> = { ...data, version: 59 }

  const chatOptions = isRecord(next.chatOptions) ? { ...next.chatOptions } : {}
  if (typeof chatOptions.ribbonClickAction !== 'string') {
    chatOptions.ribbonClickAction = 'sidebar'
  }
  next.chatOptions = chatOptions

  return next
}
