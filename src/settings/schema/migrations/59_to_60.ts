import type { SettingMigration } from '../setting.types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * v59→v60: force `mcp.enableToolDisclosure` to `false`.
 *
 * The feature shipped default-on in v57, but issue #340 showed that many
 * models can't reliably pick up tool schemas disclosed through tool_result
 * bodies. Until prompt/mechanism tuning catches up, treat this as opt-in.
 */
export const migrateFrom59To60: SettingMigration['migrate'] = (data) => {
  const next: Record<string, unknown> = { ...data, version: 60 }

  const mcp = isRecord(next.mcp) ? { ...next.mcp } : {}
  mcp.enableToolDisclosure = false
  next.mcp = mcp

  return next
}
