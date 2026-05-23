import type { SettingMigration } from '../setting.types'

/**
 * v52→v53: purely additive schema bump.
 *
 * - `builtinToolProvider` enum gains `'grok'`.
 * - `builtinTools.openrouter.webSearch` gains optional `engine` and
 *   `maxResults` per OpenRouter's web plugin spec.
 * - `builtinTools` gains optional `grok` and `gemini` sub-keys (model-level
 *   web-search toggle for Grok Live Search and Gemini Google Search grounding).
 *
 * Existing v52 data is forward-compatible — every new field is optional and
 * old values stay valid. The migration only stamps the version so loaders
 * stay in lock-step with `SETTINGS_SCHEMA_VERSION`.
 */
export const migrateFrom52To53: SettingMigration['migrate'] = (data) => {
  return { ...data, version: 53 }
}
