/**
 * Type definitions for the config import/export feature
 */

/** Top-level structure of the export file */
export type ConfigExportFile = {
  /** Fixed identifier for validating the file format */
  $schema: 'yolo-config-export'
  /** Export file format version (incremented on future format changes) */
  formatVersion: number
  /** SETTINGS_SCHEMA_VERSION at export time; used to drive the migration chain on import */
  settingsVersion: number
  /** Export timestamp as ISO string */
  exportedAt: string
  /** Plugin version at export time */
  pluginVersion: string
  /** Whether this is a redacted export (sensitive fields replaced with random strings) */
  redacted: boolean
  /** List of exported config keys */
  keys: string[]
  /** Actual config data (only contains fields listed in keys) */
  data: Record<string, unknown>
  /** SHA-256 hash (hex) of all fields except checksum, serialized as JSON; used for integrity validation */
  checksum: string
}

/** Import source type */
export type ImportSource = 'file' | 'vault'

/** Import merge strategy */
export type MergeStrategy = 'overwrite' | 'merge'

/** Metadata for a config key */
export type ConfigKeyMeta = {
  /** Key in data.json */
  key: string
  /** Human-readable default label used when i18n is missing */
  fallbackLabel: string
}

/** Current export file format version */
export const CONFIG_EXPORT_FORMAT_VERSION = 1

/**
 * Error keys used on import/validation failure, paired with `configTransfer.errors.*` translation entries.
 */
export type ImportErrorKey =
  | 'errorNotJson'
  | 'errorNotExportFile'
  | 'errorInvalidFormatVersion'
  | 'errorInvalidSettingsVersion'
  | 'errorFileFromNewerVersion'
  | 'errorEmptyKeys'
  | 'errorMissingData'
  | 'errorTampered'
  | 'errorChecksumMismatch'
  | 'errorVaultParseFailed'
  | 'errorVaultMissingVersion'
  | 'errorVaultFromNewerVersion'
  | 'errorVaultEmpty'
  | 'errorApplyVersionMismatch'
  | 'errorApplySchema'
