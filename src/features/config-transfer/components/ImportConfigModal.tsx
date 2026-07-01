import { App, Notice, Platform } from 'obsidian'
import React, { useCallback, useMemo, useState } from 'react'

import { ReactModal } from '../../../components/common/ReactModal'
import { useLanguage } from '../../../contexts/language-context'
import YoloPlugin from '../../../main'
import { EXCLUDED_KEYS, EXPORTABLE_CONFIG_KEYS } from '../config-keys'
import {
  ImportValidationError,
  applyImport,
  parseVaultData,
  renderImportError,
  validateExportFile,
} from '../import-config'
import { hasNonEmptyCredentials } from '../redact'
import { ConfigExportFile, MergeStrategy } from '../types'

type ImportConfigModalComponentProps = {
  plugin: YoloPlugin
}

export class ImportConfigModal extends ReactModal<ImportConfigModalComponentProps> {
  constructor(app: App, plugin: YoloPlugin) {
    super({
      app,
      Component: ImportConfigModalComponent,
      props: { plugin },
      options: {
        title: plugin.t('configTransfer.import.title', 'Import Configuration'),
      },
      plugin,
    })
  }
}

type ImportStep = 'source' | 'select'

function ImportConfigModalComponent({
  plugin,
  onClose,
}: ImportConfigModalComponentProps & { onClose: () => void }) {
  const { t } = useLanguage()
  const [step, setStep] = useState<ImportStep>('source')
  const [importData, setImportData] = useState<ConfigExportFile | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('overwrite')

  const handleFileImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        let raw: unknown
        try {
          raw = JSON.parse(text)
        } catch {
          new Notice(
            t(
              'configTransfer.import.noticeInvalidJson',
              'The file is not valid JSON. Please confirm you selected the correct configuration file.',
            ),
            5000,
          )
          return
        }
        const result = await validateExportFile(raw)
        if (!result.valid) {
          new Notice(renderImportError(result, t), 5000)
          return
        }
        setImportData(result.data)
        setSelectedKeys(new Set(result.data.keys))
        setStep('select')
        if (result.data.redacted) {
          new Notice(
            t(
              'configTransfer.import.noticeRedactedHint',
              'Note: This configuration was exported with redaction. All API keys / passwords / headers / environment variables have been cleared and must be filled in manually after import.',
            ),
            5000,
          )
        }
      } catch {
        new Notice(
          t(
            'configTransfer.import.noticeFileReadFailed',
            'Failed to read file. Please try again.',
          ),
          5000,
        )
      }
    }
    input.click()
  }, [t])

  const handleVaultImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (!files || files.length === 0) return

      let dataJsonFile: File | null = null
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const relativePath = file.webkitRelativePath
        // Look for YOLO config file in an external vault; match common config directory names
        /* eslint-disable obsidianmd/hardcoded-config-path */
        const configDirPatterns = [
          '.obsidian/plugins/yolo/data.json',
          '.obsidian/plugins/obsidian-yolo/data.json',
        ]
        /* eslint-enable obsidianmd/hardcoded-config-path */
        if (
          configDirPatterns.some((pattern) => relativePath.includes(pattern))
        ) {
          dataJsonFile = file
          break
        }
      }

      if (!dataJsonFile) {
        new Notice(
          t(
            'configTransfer.import.noticePluginNotFound',
            'YOLO plugin configuration not found in this directory',
          ),
          5000,
        )
        return
      }

      try {
        const text = await dataJsonFile.text()
        let raw: unknown
        try {
          raw = JSON.parse(text)
        } catch {
          new Notice(
            t(
              'configTransfer.import.noticeInvalidJson',
              'Configuration file is not valid JSON',
            ),
            5000,
          )
          return
        }
        const result = parseVaultData(raw, plugin.manifest.version)
        if (!result.valid) {
          new Notice(renderImportError(result, t), 5000)
          return
        }
        setImportData(result.data)
        setSelectedKeys(
          new Set(result.data.keys.filter((k) => !EXCLUDED_KEYS.has(k))),
        )
        setStep('select')
      } catch {
        new Notice(
          t(
            'configTransfer.import.noticeFileReadFailed',
            'Failed to read configuration file',
          ),
          5000,
        )
      }
    }
    input.click()
  }, [plugin, t])

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const selectAll = () => {
    if (importData) {
      setSelectedKeys(
        new Set(importData.keys.filter((k) => !EXCLUDED_KEYS.has(k))),
      )
    }
  }

  const selectNone = () => {
    setSelectedKeys(new Set())
  }

  const handleImport = async () => {
    if (!importData) return
    if (selectedKeys.size === 0) {
      new Notice(
        t(
          'configTransfer.import.noticeAtLeastOne',
          'Please select at least one configuration item',
        ),
      )
      return
    }

    try {
      const currentSettings = plugin.settings
      const result = applyImport({
        importData,
        selectedKeys: Array.from(selectedKeys),
        currentSettings,
        mergeStrategy,
      })

      await plugin.setSettings(result)
      new Notice(
        t(
          'configTransfer.import.noticeSuccess',
          'Configuration imported successfully',
        ),
      )

      if (importData.redacted) {
        new Notice(
          t(
            'configTransfer.import.noticeRedactedReminder',
            'Note: This configuration was exported with redaction. All API keys / passwords / headers / environment variables have been cleared. Please go to Settings to fill them in.',
          ),
          5000,
        )
      }

      onClose()
    } catch (err) {
      console.error('Failed to import config', err)
      const failedPrefix = t(
        'configTransfer.import.noticeFailed',
        'Configuration import failed',
      )
      if (err instanceof ImportValidationError) {
        const reason = renderImportError(err, t)
        const detail =
          err.issues.length > 0 ? `\n${err.issues.slice(0, 5).join('\n')}` : ''
        new Notice(`${failedPrefix}：${reason}${detail}`, 8000)
      } else {
        const message = err instanceof Error ? err.message : String(err)
        new Notice(`${failedPrefix}：${message}`, 8000)
      }
    }
  }

  const availableKeys = importData
    ? EXPORTABLE_CONFIG_KEYS.filter((k) => importData.keys.includes(k.key))
    : []

  // Determine which keys contain credentials based on the actual import data.
  // For redacted exports (redacted=true), all sensitive fields are random strings,
  // but we still mark them as "contains credentials" since telling the user
  // "this section involves credentials and will be cleared" is the correct semantic.
  const credentialsByKey = useMemo(() => {
    const map: Record<string, boolean> = {}
    if (!importData) return map
    for (const item of availableKeys) {
      map[item.key] = hasNonEmptyCredentials(importData.data[item.key])
    }
    return map
  }, [importData, availableKeys])

  if (step === 'source') {
    return (
      <div className="yolo-config-transfer-modal">
        <div className="yolo-config-transfer-source-buttons">
          <button
            className="yolo-config-transfer-source-btn"
            onClick={handleFileImport}
          >
            <strong>
              {t(
                'configTransfer.import.sourceFile',
                'Import from configuration file',
              )}
            </strong>
            <span>
              {t(
                'configTransfer.import.sourceFileDesc',
                'Select a previously exported .json file',
              )}
            </span>
          </button>

          {Platform.isDesktop && (
            <button
              className="yolo-config-transfer-source-btn"
              onClick={handleVaultImport}
            >
              <strong>
                {t(
                  'configTransfer.import.sourceVault',
                  'Import from another vault',
                )}
              </strong>
              <span>
                {t(
                  'configTransfer.import.sourceVaultDesc',
                  'Select a vault directory with YOLO installed',
                )}
              </span>
            </button>
          )}
        </div>

        <div className="modal-button-container">
          <button className="mod-cancel" onClick={onClose}>
            {t('configTransfer.import.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="yolo-config-transfer-modal">
      <div className="yolo-config-transfer-toolbar">
        <div className="yolo-config-transfer-desc">
          {t(
            'configTransfer.import.description',
            'Select configuration items to import',
          )}
        </div>
        <div className="yolo-config-transfer-toolbar-actions">
          <button onClick={selectAll}>
            {t('configTransfer.import.selectAll', 'Select All')}
          </button>
          <button onClick={selectNone}>
            {t('configTransfer.import.selectNone', 'Select None')}
          </button>
        </div>
      </div>

      <div className="yolo-config-transfer-list">
        {availableKeys.map((item) => (
          <label key={item.key} className="yolo-config-transfer-item">
            <input
              type="checkbox"
              checked={selectedKeys.has(item.key)}
              onChange={() => toggleKey(item.key)}
            />
            <span className="yolo-config-transfer-item-label">
              {t(`configTransfer.keyLabels.${item.key}`, item.fallbackLabel)}
              <span className="yolo-config-transfer-item-key">{item.key}</span>
            </span>
            {credentialsByKey[item.key] && (
              <span className="yolo-config-transfer-sensitive">
                {t('configTransfer.import.sensitive', 'Contains credentials')}
              </span>
            )}
          </label>
        ))}
      </div>

      <div className="yolo-config-transfer-strategy">
        <label
          className={`yolo-config-transfer-strategy-option${mergeStrategy === 'overwrite' ? ' is-selected' : ''}`}
          onClick={() => setMergeStrategy('overwrite')}
        >
          <span className="yolo-config-transfer-radio">
            {mergeStrategy === 'overwrite' && (
              <span className="yolo-config-transfer-radio-dot" />
            )}
          </span>
          <span>
            <strong>
              {t(
                'configTransfer.import.strategyOverwriteTitle',
                'Full Overwrite',
              )}
            </strong>
            {' — '}
            {t(
              'configTransfer.import.strategyOverwriteDesc',
              'Replace selected items with imported configuration',
            )}
          </span>
        </label>
        <label
          className={`yolo-config-transfer-strategy-option${mergeStrategy === 'merge' ? ' is-selected' : ''}`}
          onClick={() => setMergeStrategy('merge')}
        >
          <span className="yolo-config-transfer-radio">
            {mergeStrategy === 'merge' && (
              <span className="yolo-config-transfer-radio-dot" />
            )}
          </span>
          <span>
            <strong>
              {t('configTransfer.import.strategyMergeTitle', 'JSON Merge')}
            </strong>
            {' — '}
            {t(
              'configTransfer.import.strategyMergeDesc',
              'Deep merge, preserving existing values that do not conflict',
            )}
          </span>
        </label>
      </div>

      <div className="modal-button-container">
        <button className="mod-cta" onClick={() => void handleImport()}>
          {t('configTransfer.import.submit', 'Confirm Import')}
        </button>
        <button className="mod-cancel" onClick={() => setStep('source')}>
          {t('configTransfer.import.back', 'Back')}
        </button>
        <button className="mod-cancel" onClick={onClose}>
          {t('configTransfer.import.cancel', 'Cancel')}
        </button>
      </div>
    </div>
  )
}
