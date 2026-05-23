import type { SettingMigration } from '../setting.types'

/**
 * v53→v54: introduce `ragOptions.embeddingConcurrency` (default 10).
 *
 * Older code embedded chunks with a hardcoded ceiling of 24 parallel requests,
 * which triggers HTTP 429 on Azure S0 / per-minute-quota providers reported in
 * issue #297. The new field exposes the ceiling and defaults it to 10, which
 * the schema's `.catch(10)` already handles for missing values — this
 * migration only stamps the version so loaders stay in lock-step with
 * `SETTINGS_SCHEMA_VERSION`.
 */
export const migrateFrom53To54: SettingMigration['migrate'] = (data) => {
  return { ...data, version: 54 }
}
