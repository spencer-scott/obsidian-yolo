import type { SettingMigration } from '../setting.types'

/**
 * v56→v57: add a global switch for on-demand tool disclosure.
 */
export const migrateFrom56To57: SettingMigration['migrate'] = (data) => {
  const newData: Record<string, unknown> = { ...data, version: 57 }
  const mcp =
    newData.mcp &&
    typeof newData.mcp === 'object' &&
    !Array.isArray(newData.mcp)
      ? { ...(newData.mcp as Record<string, unknown>) }
      : {}

  if (typeof mcp.enableToolDisclosure !== 'boolean') {
    mcp.enableToolDisclosure = true
  }

  newData.mcp = mcp
  return newData
}
