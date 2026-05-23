import { SettingMigration } from '../setting.types'

/**
 * v55→v56: drop legacy `debug.logModelRequestContext`. The new
 * `captureRawRequestDebug` Trace captures a strict superset of what the old
 * console-log toggle exposed (final request payload after customParameters
 * merge), so the old toggle is removed to avoid two overlapping debug
 * affordances.
 */
export const migrateFrom55To56: SettingMigration['migrate'] = (data) => {
  const newData = { ...data, version: 56 }

  if (
    'debug' in newData &&
    newData.debug &&
    typeof newData.debug === 'object' &&
    !Array.isArray(newData.debug)
  ) {
    const debug = { ...(newData.debug as Record<string, unknown>) }
    delete debug.logModelRequestContext
    newData.debug = debug
  }

  return newData
}
