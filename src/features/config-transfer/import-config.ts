import { ensureDefaultAssistantInSettings } from '../../core/agent/default-assistant'
import { SETTINGS_SCHEMA_VERSION } from '../../settings/schema/migrations'
import {
  YoloSettings,
  yoloSettingsSchema,
} from '../../settings/schema/setting.types'
import { normalizeYoloSettingsReferences } from '../../settings/schema/settings'

import { EXCLUDED_KEYS, EXPORTABLE_CONFIG_KEYS } from './config-keys'
import { computeChecksum } from './export-config'
import { deepMerge } from './merge-utils'
import { clearSensitive } from './redact'
import { ConfigExportFile, ImportErrorKey, MergeStrategy } from './types'

export type ValidationFailure = {
  valid: false
  errorKey: ImportErrorKey
  fallback: string
  params?: Record<string, string | number>
}

export type ValidationResult =
  | { valid: true; data: ConfigExportFile }
  | ValidationFailure

function failure(
  errorKey: ImportErrorKey,
  fallback: string,
  params?: Record<string, string | number>,
): ValidationFailure {
  return { valid: false, errorKey, fallback, params }
}

/**
 * Validate whether the export file format is valid.
 */
export async function validateExportFile(
  raw: unknown,
): Promise<ValidationResult> {
  if (!raw || typeof raw !== 'object') {
    return failure('errorNotJson', 'File content is not a valid JSON object')
  }

  const obj = raw as Record<string, unknown>

  if (obj.$schema !== 'yolo-config-export') {
    return failure(
      'errorNotExportFile',
      'This file is not a YOLO plugin configuration export file. Please select a .json file generated via the "Export Configuration" function.',
    )
  }

  if (typeof obj.formatVersion !== 'number' || obj.formatVersion < 1) {
    return failure(
      'errorInvalidFormatVersion',
      'Configuration file format version is invalid. The file may be corrupted.',
    )
  }

  if (typeof obj.settingsVersion !== 'number' || obj.settingsVersion < 0) {
    return failure(
      'errorInvalidSettingsVersion',
      'Settings version number in the configuration file is invalid. The file may be corrupted.',
    )
  }

  if (obj.settingsVersion !== SETTINGS_SCHEMA_VERSION) {
    if (obj.settingsVersion > SETTINGS_SCHEMA_VERSION) {
      return failure(
        'errorFileFromNewerVersion',
        `Configuration file is from a newer plugin version (version ${obj.settingsVersion}). Current plugin version is ${SETTINGS_SCHEMA_VERSION}. Please upgrade the plugin before importing.`,
        {
          fileVersion: obj.settingsVersion,
          currentVersion: SETTINGS_SCHEMA_VERSION,
        },
      )
    }
    return failure(
      'errorFileFromOlderVersion',
      `Configuration file is from an older plugin version (version ${obj.settingsVersion}). Current plugin version is ${SETTINGS_SCHEMA_VERSION}. Please upgrade the YOLO plugin on the source and re-export.`,
      {
        fileVersion: obj.settingsVersion,
        currentVersion: SETTINGS_SCHEMA_VERSION,
      },
    )
  }

  if (!Array.isArray(obj.keys) || obj.keys.length === 0) {
    return failure('errorEmptyKeys', 'The configuration file does not contain any configuration items.')
  }

  if (!obj.data || typeof obj.data !== 'object') {
    return failure('errorMissingData', 'The data field in the configuration file is missing or invalid.')
  }

  // Validate consistency between keys and data
  const dataKeys = Object.keys(obj.data as Record<string, unknown>)
  const declaredKeys = new Set(obj.keys as string[])
  const undeclaredKeys = dataKeys.filter((k) => !declaredKeys.has(k))
  if (undeclaredKeys.length > 0) {
    return failure(
      'errorTampered',
      `Configuration file data is inconsistent with declarations: data contains fields not declared in keys (${undeclaredKeys.join(', ')}). The file may have been tampered with.`,
      { fields: undeclaredKeys.join(', ') },
    )
  }

  // Validate checksum integrity
  if (typeof obj.checksum === 'string' && obj.checksum.length > 0) {
    const { checksum, ...payload } = obj
    const expectedChecksum = await computeChecksum(JSON.stringify(payload))
    if (checksum !== expectedChecksum) {
      return failure(
        'errorChecksumMismatch',
        'Configuration file integrity check failed. The file content may have been modified.',
      )
    }
  }

  return { valid: true, data: obj as unknown as ConfigExportFile }
}

/**
 * Extract importable configuration from another vault's raw data.json data.
 * Returns a ConfigExportFile-like structure for unified downstream processing.
 */
export function parseVaultData(
  raw: unknown,
  pluginVersion?: string,
): ValidationResult {
  if (!raw || typeof raw !== 'object') {
    return failure('errorVaultParseFailed', 'Unable to parse configuration data from the target vault')
  }

  const obj = raw as Record<string, unknown>

  if (typeof obj.version !== 'number') {
    return failure(
      'errorVaultMissingVersion',
      'The target vault configuration data is missing the version field. Cannot determine version compatibility.',
    )
  }

  if (obj.version !== SETTINGS_SCHEMA_VERSION) {
    if (obj.version > SETTINGS_SCHEMA_VERSION) {
      return failure(
        'errorVaultFromNewerVersion',
        `The target vault uses a newer plugin version (version ${obj.version}). Current plugin version is ${SETTINGS_SCHEMA_VERSION}. Please upgrade the plugin before importing.`,
        { vaultVersion: obj.version, currentVersion: SETTINGS_SCHEMA_VERSION },
      )
    }
    return failure(
      'errorVaultFromOlderVersion',
      `The target vault uses an older plugin version (version ${obj.version}). Current plugin version is ${SETTINGS_SCHEMA_VERSION}. Please upgrade the YOLO plugin in the target vault before importing.`,
      { vaultVersion: obj.version, currentVersion: SETTINGS_SCHEMA_VERSION },
    )
  }

  // Under the strict same-version policy, top-level fields not declared in
  // EXPORTABLE_CONFIG_KEYS should not enter the candidate list. Otherwise, users
  // could select these fields, but yoloSettingsSchema would strip them out,
  // resulting in a misleading "import successful" with no actual effect.
  const exportableKeySet = new Set(EXPORTABLE_CONFIG_KEYS.map((k) => k.key))
  const data: Record<string, unknown> = {}
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (EXCLUDED_KEYS.has(key)) continue
    if (!exportableKeySet.has(key)) continue
    data[key] = value
    keys.push(key)
  }

  if (keys.length === 0) {
    return failure('errorVaultEmpty', 'The target vault configuration data is empty')
  }

  const exportFile: ConfigExportFile = {
    $schema: 'yolo-config-export',
    formatVersion: 1,
    settingsVersion: obj.version,
    exportedAt: new Date().toISOString(),
    pluginVersion: pluginVersion ?? 'unknown',
    redacted: false,
    keys,
    data,
    checksum: '',
  }

  return { valid: true, data: exportFile }
}

export type ImportOptions = {
  /** Validated import data (version matches current) */
  importData: ConfigExportFile
  /** List of keys the user selected to import */
  selectedKeys: string[]
  /** Current full settings */
  currentSettings: YoloSettings
  /** Merge strategy */
  mergeStrategy: MergeStrategy
}

type TranslateFn = (keyPath: string, fallback?: string) => string

function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    name in params ? String(params[name]) : `{${name}}`,
  )
}

/**
 * Render the errorKey + fallback + params from a ValidationFailure / ImportValidationError
 * into the final user-facing string.
 */
export function renderImportError(
  failure:
    | ValidationFailure
    | {
        errorKey: ImportErrorKey
        fallback: string
        params?: Record<string, string | number>
      },
  t: TranslateFn,
): string {
  const template = t(
    `configTransfer.errors.${failure.errorKey}`,
    failure.fallback,
  )
  return interpolate(template, failure.params)
}

export class ImportValidationError extends Error {
  constructor(
    public readonly errorKey: ImportErrorKey,
    public readonly fallback: string,
    public readonly issues: string[] = [],
    public readonly params?: Record<string, string | number>,
  ) {
    super(fallback)
    this.name = 'ImportValidationError'
  }
}

/**
 * Execute configuration import and return the merged full settings.
 *
 * Precondition: importData.settingsVersion must equal SETTINGS_SCHEMA_VERSION
 * (guaranteed by validateExportFile / parseVaultData). This function does not
 * handle cross-version migration.
 *
 * Flow:
 * 1. Merge importData.data into currentSettings according to the merge strategy
 *    (for redacted exports, clear all sensitive fields first to avoid writing fake credentials)
 * 2. Explicitly validate via yoloSettingsSchema; on failure, throw ImportValidationError.
 *    The caller is responsible for notifying the user and preserving the original config
 *    (no silent fallback to defaults)
 * 3. Normalize references and ensure default assistant on the valid result
 */
export function applyImport(options: ImportOptions): YoloSettings {
  const { importData, selectedKeys, currentSettings, mergeStrategy } = options

  if (importData.settingsVersion !== SETTINGS_SCHEMA_VERSION) {
    throw new ImportValidationError(
      'errorApplyVersionMismatch',
      `Import data version (${importData.settingsVersion}) does not match the current plugin version (${SETTINGS_SCHEMA_VERSION}). Cannot import.`,
      [],
      {
        importVersion: importData.settingsVersion,
        currentVersion: SETTINGS_SCHEMA_VERSION,
      },
    )
  }

  // 1. Merge into current config according to the merge strategy. For redacted exports,
  //    all sensitive fields (apiKey/password/headers/env/customHeaders.value) are random
  //    strings. Clear them before import to avoid writing fake credentials back to
  //    providers/webSearch/mcp.
  const incomingData = importData.redacted
    ? (clearSensitive(importData.data) as Record<string, unknown>)
    : importData.data

  const currentRaw = currentSettings as unknown as Record<string, unknown>
  const merged: Record<string, unknown> = { ...currentRaw }

  for (const key of selectedKeys) {
    if (EXCLUDED_KEYS.has(key)) continue

    const importedValue = incomingData[key]
    if (importedValue === undefined) continue

    if (mergeStrategy === 'overwrite') {
      merged[key] = importedValue
    } else {
      const currentValue = merged[key]
      if (
        typeof currentValue === 'object' &&
        currentValue !== null &&
        !Array.isArray(currentValue) &&
        typeof importedValue === 'object' &&
        importedValue !== null &&
        !Array.isArray(importedValue)
      ) {
        merged[key] = deepMerge(
          currentValue as Record<string, unknown>,
          importedValue as Record<string, unknown>,
        )
      } else {
        merged[key] = importedValue
      }
    }
  }

  merged.version = SETTINGS_SCHEMA_VERSION

  // 2. Explicit schema validation; throw on failure (do not fall back to parseYoloSettings defaults)
  const parsed = yoloSettingsSchema.safeParse(merged)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
      return `${path}: ${issue.message}`
    })
    throw new ImportValidationError(
      'errorApplySchema',
      'Imported configuration failed validation. There may be missing fields or format errors.',
      issues,
    )
  }

  // 3. Normalize references + ensure default assistant fallback
  const normalized = normalizeYoloSettingsReferences(parsed.data)
  return ensureDefaultAssistantInSettings({
    ...normalized,
    version: SETTINGS_SCHEMA_VERSION,
  })
}
