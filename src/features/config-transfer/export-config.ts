import { SETTINGS_SCHEMA_VERSION } from '../../settings/schema/migrations'

import { EXCLUDED_KEYS } from './config-keys'
import { redactSensitive } from './redact'
import { CONFIG_EXPORT_FORMAT_VERSION, ConfigExportFile } from './types'

/**
 * Compute the SHA-256 hash of a string (hex format).
 */
export async function computeChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type ExportOptions = {
  /** List of keys to export */
  keys: string[]
  /** Full current settings data (raw data.json content) */
  settingsData: Record<string, unknown>
  /** Plugin version */
  pluginVersion: string
  /** Whether to redact sensitive fields */
  redacted?: boolean
}

/**
 * Extract data from settings based on user-selected keys and generate export file content.
 */
export async function buildExportData(
  options: ExportOptions,
): Promise<ConfigExportFile> {
  const { keys, settingsData, pluginVersion, redacted = false } = options

  // Extract data for selected keys
  const data: Record<string, unknown> = {}
  for (const key of keys) {
    if (EXCLUDED_KEYS.has(key)) continue
    if (key in settingsData) {
      data[key] = settingsData[key]
    }
  }

  // Redaction processing
  const finalData = redacted
    ? (redactSensitive(data) as Record<string, unknown>)
    : data

  // Build the object without checksum
  const payload = {
    $schema: 'yolo-config-export' as const,
    formatVersion: CONFIG_EXPORT_FORMAT_VERSION,
    settingsVersion: SETTINGS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    pluginVersion,
    redacted,
    keys,
    data: finalData,
  }

  // Compute SHA-256 of the full payload as checksum
  const checksum = await computeChecksum(JSON.stringify(payload))

  return {
    ...payload,
    checksum,
  }
}
