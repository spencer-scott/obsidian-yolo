import { SETTINGS_SCHEMA_VERSION } from '../../settings/schema/migrations'
import { parseYoloSettings } from '../../settings/schema/settings'

import { buildExportData, computeChecksum } from './export-config'
import {
  ImportValidationError,
  applyImport,
  parseVaultData,
  renderImportError,
  validateExportFile,
} from './import-config'
import { CONFIG_EXPORT_FORMAT_VERSION, ConfigExportFile } from './types'

describe('validateExportFile', () => {
  // Base file without checksum (skips checksum validation)
  const validFile = {
    $schema: 'yolo-config-export',
    formatVersion: CONFIG_EXPORT_FORMAT_VERSION,
    settingsVersion: SETTINGS_SCHEMA_VERSION,
    exportedAt: '2026-05-11T10:00:00.000Z',
    pluginVersion: '1.5.7.5',
    redacted: false,
    keys: ['providers', 'chatModelId'],
    data: {
      providers: [],
      chatModelId: 'test/model',
    },
  }

  it('should accept a valid export file without checksum', async () => {
    const result = await validateExportFile(validFile)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.$schema).toBe('yolo-config-export')
    }
  })

  it('should accept a valid export file with correct checksum', async () => {
    const { checksum, ...payload } = validFile as Record<string, unknown>
    void checksum
    const correctChecksum = await computeChecksum(JSON.stringify(payload))
    const fileWithChecksum = { ...validFile, checksum: correctChecksum }
    const result = await validateExportFile(fileWithChecksum)
    expect(result.valid).toBe(true)
  })

  it('should reject a file with incorrect checksum (tampered content)', async () => {
    const fileWithBadChecksum = {
      ...validFile,
      checksum:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }
    const result = await validateExportFile(fileWithBadChecksum)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorChecksumMismatch')
    }
  })

  it('should reject null input', async () => {
    const result = await validateExportFile(null)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorNotJson')
    }
  })

  it('should reject non-object input', async () => {
    const result = await validateExportFile('not an object')
    expect(result.valid).toBe(false)
  })

  it('should reject missing $schema', async () => {
    const result = await validateExportFile({
      ...validFile,
      $schema: undefined,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorNotExportFile')
    }
  })

  it('should reject wrong $schema value', async () => {
    const result = await validateExportFile({ ...validFile, $schema: 'wrong' })
    expect(result.valid).toBe(false)
  })

  it('should reject invalid formatVersion', async () => {
    const result = await validateExportFile({ ...validFile, formatVersion: 0 })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorInvalidFormatVersion')
    }
  })

  it('should reject invalid settingsVersion', async () => {
    const result = await validateExportFile({
      ...validFile,
      settingsVersion: -1,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorInvalidSettingsVersion')
    }
  })

  it('should reject settingsVersion lower than current schema version', async () => {
    const result = await validateExportFile({
      ...validFile,
      settingsVersion: SETTINGS_SCHEMA_VERSION - 1,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorFileFromOlderVersion')
      expect(result.params?.fileVersion).toBe(SETTINGS_SCHEMA_VERSION - 1)
    }
  })

  it('should reject settingsVersion higher than current schema version', async () => {
    const result = await validateExportFile({
      ...validFile,
      settingsVersion: SETTINGS_SCHEMA_VERSION + 1,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorFileFromNewerVersion')
      expect(result.params?.fileVersion).toBe(SETTINGS_SCHEMA_VERSION + 1)
    }
  })

  it('should reject empty keys array', async () => {
    const result = await validateExportFile({ ...validFile, keys: [] })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorEmptyKeys')
    }
  })

  it('should reject missing data field', async () => {
    const result = await validateExportFile({ ...validFile, data: undefined })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorMissingData')
    }
  })

  it('should reject when data contains keys not declared in keys array', async () => {
    const tampered = {
      ...validFile,
      keys: ['providers'],
      data: {
        providers: [],
        systemPrompt: 'injected',
      },
    }
    const result = await validateExportFile(tampered)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorTampered')
      expect(String(result.params?.fields)).toContain('systemPrompt')
    }
  })

  it('should accept when keys is a superset of data keys (some keys have no data)', async () => {
    const sparse = {
      ...validFile,
      keys: ['providers', 'chatModelId', 'ragOptions'],
      data: {
        providers: [],
        chatModelId: 'test/model',
      },
    }
    const result = await validateExportFile(sparse)
    expect(result.valid).toBe(true)
  })

  it('should accept a file with higher formatVersion (forward compatible)', async () => {
    const futureFile = {
      ...validFile,
      formatVersion: 99,
    }
    const result = await validateExportFile(futureFile)
    expect(result.valid).toBe(true)
  })

  it('should validate checksum end-to-end with buildExportData', async () => {
    const exported = await buildExportData({
      keys: ['providers', 'chatModelId'],
      settingsData: {
        providers: [{ id: 'test', apiKey: 'key' }],
        chatModelId: 'test/model',
      },
      pluginVersion: '1.5.7.5',
    })

    // A normally exported file should pass validation
    const result = await validateExportFile(exported)
    expect(result.valid).toBe(true)

    // Should fail after tampering
    const tampered = { ...exported, redacted: true }
    const tamperedResult = await validateExportFile(tampered)
    expect(tamperedResult.valid).toBe(false)
    if (!tamperedResult.valid) {
      expect(tamperedResult.errorKey).toBe('errorChecksumMismatch')
    }
  })
})

describe('parseVaultData', () => {
  it('should parse vault data.json with matching version', () => {
    const vaultData = {
      version: SETTINGS_SCHEMA_VERSION,
      __meta: { deviceId: 'other-device' },
      providers: [{ id: 'openai', apiKey: 'sk-xxx' }],
      chatModels: [
        { id: 'openai/gpt-4', model: 'gpt-4', providerId: 'openai' },
      ],
      chatModelId: 'openai/gpt-4',
    }

    const result = parseVaultData(vaultData, '1.5.0')
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.settingsVersion).toBe(SETTINGS_SCHEMA_VERSION)
      expect(result.data.keys).toContain('providers')
      expect(result.data.keys).toContain('chatModels')
      expect(result.data.keys).toContain('chatModelId')
      expect(result.data.keys).not.toContain('version')
      expect(result.data.keys).not.toContain('__meta')
      expect(result.data.data).not.toHaveProperty('version')
      expect(result.data.data).not.toHaveProperty('__meta')
    }
  })

  it('should reject null input', () => {
    const result = parseVaultData(null)
    expect(result.valid).toBe(false)
  })

  it('should reject empty object (no exportable keys)', () => {
    const result = parseVaultData({
      version: SETTINGS_SCHEMA_VERSION,
      __meta: {},
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorVaultEmpty')
    }
  })

  it('should reject when version field is missing', () => {
    const result = parseVaultData({ providers: [] })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorVaultMissingVersion')
    }
  })

  it('should reject older vault version', () => {
    const result = parseVaultData({
      version: SETTINGS_SCHEMA_VERSION - 1,
      providers: [],
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorVaultFromOlderVersion')
    }
  })

  it('should reject newer vault version', () => {
    const result = parseVaultData({
      version: SETTINGS_SCHEMA_VERSION + 1,
      providers: [],
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errorKey).toBe('errorVaultFromNewerVersion')
    }
  })

  it('should drop unknown top-level keys not in EXPORTABLE_CONFIG_KEYS', () => {
    // Under the same-version policy, fields not on the allowlist are stripped by schema
    // and will not be persisted. Users should not be able to select them in the UI,
    // creating a false impression of "import successful but ineffective".
    const vaultData = {
      version: SETTINGS_SCHEMA_VERSION,
      providers: [],
      futureFeature: { enabled: true },
    }
    const result = parseVaultData(vaultData)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.keys).toContain('providers')
      expect(result.data.keys).not.toContain('futureFeature')
      expect(result.data.data).not.toHaveProperty('futureFeature')
    }
  })
})

describe('applyImport', () => {
  const currentSettings = parseYoloSettings({
    version: SETTINGS_SCHEMA_VERSION,
    providers: [
      { id: 'existing', presetType: 'openai', apiKey: 'existing-key' },
    ],
    chatModels: [
      {
        providerId: 'existing',
        id: 'existing/gpt-4',
        model: 'gpt-4',
        enable: true,
      },
    ],
    chatModelId: 'existing/gpt-4',
    ragOptions: {
      enabled: true,
      chunkSize: 1000,
      limit: 10,
      excludePatterns: ['*.tmp'],
    },
  })

  const makeImportData = (
    overrides: Partial<ConfigExportFile>,
  ): ConfigExportFile => ({
    $schema: 'yolo-config-export',
    formatVersion: 1,
    settingsVersion: SETTINGS_SCHEMA_VERSION,
    exportedAt: '2026-05-11T10:00:00.000Z',
    pluginVersion: '1.5.7.5',
    redacted: false,
    checksum: '',
    keys: [],
    data: {},
    ...overrides,
  })

  it('should overwrite selected keys in overwrite mode', () => {
    const importData = makeImportData({
      keys: ['ragOptions'],
      data: { ragOptions: { enabled: false, chunkSize: 500, limit: 5 } },
    })

    const result = applyImport({
      importData,
      selectedKeys: ['ragOptions'],
      currentSettings,
      mergeStrategy: 'overwrite',
    })

    expect(result.ragOptions.enabled).toBe(false)
    expect(result.ragOptions.chunkSize).toBe(500)
    expect(result.ragOptions.limit).toBe(5)
    expect(result.providers).toEqual(currentSettings.providers)
  })

  it('should deep merge in merge mode, preserving current-only fields', () => {
    const importData = makeImportData({
      keys: ['ragOptions'],
      data: { ragOptions: { chunkSize: 800, limit: 20 } },
    })

    const result = applyImport({
      importData,
      selectedKeys: ['ragOptions'],
      currentSettings,
      mergeStrategy: 'merge',
    })

    expect(result.ragOptions.chunkSize).toBe(800)
    expect(result.ragOptions.limit).toBe(20)
    expect(result.ragOptions.enabled).toBe(true)
    expect(result.ragOptions.excludePatterns).toEqual(['*.tmp'])
  })

  it('should only import selected keys, ignoring unselected ones', () => {
    const importData = makeImportData({
      keys: ['ragOptions', 'systemPrompt'],
      data: { ragOptions: { chunkSize: 500 }, systemPrompt: 'imported prompt' },
    })

    const result = applyImport({
      importData,
      selectedKeys: ['systemPrompt'],
      currentSettings,
      mergeStrategy: 'overwrite',
    })

    expect(result.systemPrompt).toBe('imported prompt')
    expect(result.ragOptions.chunkSize).toBe(1000)
  })

  it('should throw ImportValidationError when settingsVersion does not match', () => {
    const importData = makeImportData({
      settingsVersion: SETTINGS_SCHEMA_VERSION - 1,
      pluginVersion: '1.4.0',
      keys: ['chatModelId'],
      data: { chatModelId: 'existing/gpt-4' },
    })

    expect(() =>
      applyImport({
        importData,
        selectedKeys: ['chatModelId'],
        currentSettings,
        mergeStrategy: 'overwrite',
      }),
    ).toThrow(ImportValidationError)
  })

  it('should clear apiKey fields when importData.redacted is true', () => {
    const importData = makeImportData({
      redacted: true,
      keys: ['providers'],
      data: {
        providers: [
          {
            id: 'redacted-provider',
            presetType: 'openai',
            // Random strings from redacted exports must never be written as real keys
            apiKey: 'FAKE_RANDOM_KEY_abcdefghijklmnop',
          },
        ],
      },
    })

    const result = applyImport({
      importData,
      selectedKeys: ['providers'],
      currentSettings,
      mergeStrategy: 'overwrite',
    })

    const importedProvider = result.providers.find(
      (p) => p.id === 'redacted-provider',
    )
    expect(importedProvider).toBeDefined()
    expect(importedProvider?.apiKey).toBe('')
  })

  it('should not touch apiKey when importData.redacted is false', () => {
    const importData = makeImportData({
      redacted: false,
      keys: ['providers'],
      data: {
        providers: [
          {
            id: 'real-provider',
            presetType: 'openai',
            apiKey: 'sk-real-key',
          },
        ],
      },
    })

    const result = applyImport({
      importData,
      selectedKeys: ['providers'],
      currentSettings,
      mergeStrategy: 'overwrite',
    })

    const importedProvider = result.providers.find(
      (p) => p.id === 'real-provider',
    )
    expect(importedProvider?.apiKey).toBe('sk-real-key')
  })

  it('should silently replace malformed field with schema default (known schema .catch behavior)', () => {
    // Known limitation: yoloSettingsSchema uses .catch(default) for every field,
    // so under the same version, "invalid field format" does not throw an error
    // and is silently replaced with the default value.
    // This test pins the current behavior to prevent future reviewers from
    // mistakenly assuming applyImport can catch these issues.
    // True field-level strictness needs to be addressed in a separate schema issue.
    const importData = makeImportData({
      keys: ['ragOptions'],
      data: {
        ragOptions: 'not-an-object' as unknown as Record<string, unknown>,
      },
    })

    const result = applyImport({
      importData,
      selectedKeys: ['ragOptions'],
      currentSettings,
      mergeStrategy: 'overwrite',
    })

    // No error thrown; bad field replaced with default value
    expect(result.ragOptions).toBeDefined()
    expect(typeof result.ragOptions).toBe('object')
    expect(typeof result.ragOptions.chunkSize).toBe('number')
  })

  it('should not silently fall back to defaults when version mismatches', () => {
    // Regression: the old implementation fell back to parseYoloSettings defaults,
    // where cross-version imports would return a "success" result overridden with
    // default values. The new implementation must explicitly throw, so callers
    // can preserve the original configuration.
    const importData = makeImportData({
      settingsVersion: SETTINGS_SCHEMA_VERSION + 1,
      keys: ['ragOptions'],
      data: { ragOptions: { enabled: false, chunkSize: 999 } },
    })

    expect(() =>
      applyImport({
        importData,
        selectedKeys: ['ragOptions'],
        currentSettings,
        mergeStrategy: 'overwrite',
      }),
    ).toThrow(ImportValidationError)

    // currentSettings was not modified
    expect(currentSettings.ragOptions.chunkSize).toBe(1000)
    expect(currentSettings.ragOptions.enabled).toBe(true)
  })

  it('should normalize references after import (orphan model references)', () => {
    const importData = makeImportData({
      keys: ['chatModelId'],
      data: { chatModelId: 'nonexistent/model' },
    })

    const result = applyImport({
      importData,
      selectedKeys: ['chatModelId'],
      currentSettings,
      mergeStrategy: 'overwrite',
    })

    expect(result.chatModelId).not.toBe('nonexistent/model')
  })

  it('should handle primitive value import in merge mode (direct overwrite)', () => {
    const importData = makeImportData({
      keys: ['systemPrompt'],
      data: { systemPrompt: 'new prompt' },
    })

    const result = applyImport({
      importData,
      selectedKeys: ['systemPrompt'],
      currentSettings,
      mergeStrategy: 'merge',
    })

    expect(result.systemPrompt).toBe('new prompt')
  })

  it('should ignore EXCLUDED_KEYS in selectedKeys', () => {
    const importData = makeImportData({
      keys: ['systemPrompt', 'version'],
      data: { systemPrompt: 'imported', version: 999 },
    })

    const result = applyImport({
      importData,
      selectedKeys: ['systemPrompt', 'version', '__meta'],
      currentSettings,
      mergeStrategy: 'overwrite',
    })

    expect(result.systemPrompt).toBe('imported')
    // version should be the current SETTINGS_SCHEMA_VERSION, not overwritten by import
    expect(result.version).toBe(SETTINGS_SCHEMA_VERSION)
  })

  it('should replace arrays in merge mode (providers list)', () => {
    const importData = makeImportData({
      keys: ['providers'],
      data: {
        providers: [
          { id: 'new-provider', presetType: 'openai', apiKey: 'new-key' },
        ],
      },
    })

    const result = applyImport({
      importData,
      selectedKeys: ['providers'],
      currentSettings,
      mergeStrategy: 'merge',
    })

    // Arrays in merge mode are directly overwritten, not appended
    expect(result.providers).toHaveLength(1)
    expect(result.providers[0].id).toBe('new-provider')
  })

  it('should skip keys whose imported value is undefined', () => {
    const importData = makeImportData({
      keys: ['systemPrompt', 'chatModelId'],
      data: { chatModelId: 'existing/gpt-4' },
      // systemPrompt is declared in keys but not present in data
    })

    const result = applyImport({
      importData,
      selectedKeys: ['systemPrompt', 'chatModelId'],
      currentSettings,
      mergeStrategy: 'overwrite',
    })

    // systemPrompt is not in migratedData, should keep current value
    expect(result.systemPrompt).toBe(currentSettings.systemPrompt)
    expect(result.chatModelId).toBe('existing/gpt-4')
  })
})

describe('renderImportError', () => {
  it('interpolates params into the i18n template', () => {
    const t = (keyPath: string, fallback?: string): string => {
      if (keyPath === 'configTransfer.errors.errorFileFromOlderVersion') {
        return 'File v{fileVersion} < current v{currentVersion}'
      }
      return fallback ?? keyPath
    }
    const out = renderImportError(
      {
        valid: false,
        errorKey: 'errorFileFromOlderVersion',
        fallback: 'old version',
        params: { fileVersion: 50, currentVersion: 52 },
      },
      t,
    )
    expect(out).toBe('File v50 < current v52')
  })

  it('falls back to the fallback string when translation is missing', () => {
    const t = (_key: string, fallback?: string): string => fallback ?? _key
    const out = renderImportError(
      {
        valid: false,
        errorKey: 'errorNotJson',
        fallback: 'File is not JSON',
      },
      t,
    )
    expect(out).toBe('File is not JSON')
  })

  it('renders ImportValidationError via the same path', () => {
    const t = (_key: string, fallback?: string): string => fallback ?? _key
    const err = new ImportValidationError(
      'errorApplyVersionMismatch',
      'fallback {importVersion}/{currentVersion}',
      [],
      { importVersion: 49, currentVersion: 52 },
    )
    expect(renderImportError(err, t)).toBe('fallback 49/52')
  })
})
