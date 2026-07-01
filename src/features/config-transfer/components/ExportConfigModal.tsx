import { App, Notice, TFolder, normalizePath } from 'obsidian'
import React, { useMemo, useState } from 'react'

import { ReactModal } from '../../../components/common/ReactModal'
import { ConfirmModal } from '../../../components/modals/ConfirmModal'
import { useLanguage } from '../../../contexts/language-context'
import { getYoloBaseDir } from '../../../core/paths/yoloPaths'
import YoloPlugin from '../../../main'
import { EXPORTABLE_CONFIG_KEYS } from '../config-keys'
import { buildExportData } from '../export-config'
import { hasNonEmptyCredentials } from '../redact'

type ExportConfigModalComponentProps = {
  plugin: YoloPlugin
}

const CONFIG_EXPORT_SUBDIR = 'Exports'

function getConfigExportDir(plugin: YoloPlugin): string {
  return normalizePath(
    `${getYoloBaseDir(plugin.settings)}/${CONFIG_EXPORT_SUBDIR}`,
  )
}

async function ensureVaultFolder(app: App, folderPath: string): Promise<void> {
  const parts = folderPath.split('/').filter(Boolean)
  let currentPath = ''

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part
    const existing = app.vault.getAbstractFileByPath(currentPath)
    if (existing instanceof TFolder) continue
    if (existing) {
      throw new Error(`Cannot create export folder: ${currentPath} is a file`)
    }
    try {
      await app.vault.createFolder(currentPath)
    } catch (error) {
      const created = app.vault.getAbstractFileByPath(currentPath)
      if (created instanceof TFolder) continue
      if (await app.vault.adapter.exists(currentPath)) continue
      throw error
    }
  }
}

function getLocalTimestampForFilename(date = new Date()): string {
  const pad = (value: number): string => value.toString().padStart(2, '0')
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  ].join('_')
}

async function getAvailableConfigExportPath(
  app: App,
  plugin: YoloPlugin,
): Promise<string> {
  const exportDir = getConfigExportDir(plugin)
  await ensureVaultFolder(app, exportDir)

  const baseName = `yolo-config-${getLocalTimestampForFilename()}`
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`
    const path = normalizePath(`${exportDir}/${baseName}${suffix}.json`)
    if (!app.vault.getAbstractFileByPath(path)) return path
  }

  return normalizePath(`${exportDir}/${baseName}-${Date.now()}.json`)
}

export class ExportConfigModal extends ReactModal<ExportConfigModalComponentProps> {
  constructor(app: App, plugin: YoloPlugin) {
    super({
      app,
      Component: ExportConfigModalComponent,
      props: { plugin },
      options: {
        title: plugin.t('configTransfer.export.title', 'Export Configuration'),
      },
      plugin,
    })
  }
}

function ExportConfigModalComponent({
  plugin,
  onClose,
}: ExportConfigModalComponentProps & { onClose: () => void }) {
  const { t } = useLanguage()
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    new Set(EXPORTABLE_CONFIG_KEYS.map((k) => k.key)),
  )
  const [redacted, setRedacted] = useState(true)

  // Detect whether each top-level key contains non-empty credentials based on
  // the current in-memory settings. Uses plugin.settings rather than lazy-loading
  // loadData() since settings are already in memory and contain all schema fields.
  // Used only for UI labeling; does not affect the actual data source for export.
  const credentialsByKey = useMemo(() => {
    const settings = plugin.settings as unknown as Record<string, unknown>
    const map: Record<string, boolean> = {}
    for (const item of EXPORTABLE_CONFIG_KEYS) {
      map[item.key] = hasNonEmptyCredentials(settings?.[item.key])
    }
    return map
  }, [plugin.settings])

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
    setSelectedKeys(new Set(EXPORTABLE_CONFIG_KEYS.map((k) => k.key)))
  }

  const selectNone = () => {
    setSelectedKeys(new Set())
  }

  const confirmUnredactedExport = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      new ConfirmModal(plugin.app, {
        title: t(
          'configTransfer.export.confirmUnredactedTitle',
          'Confirm export',
        ),
        message: t(
          'configTransfer.export.confirmUnredacted',
          'This unredacted export will save API keys / passwords / headers / env vars and other sensitive data to a file in the current vault. Continue?',
        ),
        ctaText: t('configTransfer.export.submit', 'Export'),
        cancelText: t('configTransfer.export.cancel', 'Cancel'),
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      }).open()
    })
  }

  const handleExport = async () => {
    if (selectedKeys.size === 0) {
      new Notice(
        t(
          'configTransfer.export.noticeAtLeastOne',
          'Please select at least one configuration item',
        ),
      )
      return
    }

    if (!redacted) {
      const confirmed = await confirmUnredactedExport()
      if (!confirmed) return
    }

    try {
      const settingsData = (await plugin.loadData()) as Record<
        string,
        unknown
      > | null
      if (!settingsData || typeof settingsData !== 'object') {
        new Notice(
          t(
            'configTransfer.export.noticeReadFailed',
            'Unable to read current configuration data',
          ),
        )
        return
      }

      const manifest = plugin.manifest

      const exportData = await buildExportData({
        keys: Array.from(selectedKeys),
        settingsData,
        pluginVersion: manifest.version,
        redacted,
      })

      const json = JSON.stringify(exportData, null, 2)
      const exportPath = await getAvailableConfigExportPath(plugin.app, plugin)

      await plugin.app.vault.create(exportPath, json)

      const successTemplate = t(
        'configTransfer.export.noticeSuccess',
        'Configuration exported to {path}',
      )
      new Notice(successTemplate.replace('{path}', exportPath))
      onClose()
    } catch (err) {
      console.error('Failed to export config', err)
      new Notice(
        t(
          'configTransfer.export.noticeFailed',
          'Configuration export failed. Please check the console log.',
        ),
      )
    }
  }

  return (
    <div className="yolo-config-transfer-modal">
      <div className="yolo-config-transfer-toolbar">
        <div className="yolo-config-transfer-desc">
          {t(
            'configTransfer.export.description',
            'Select configuration items to export. The file will be saved to {path}',
          ).replace('{path}', getConfigExportDir(plugin))}
        </div>
        <div className="yolo-config-transfer-toolbar-actions">
          <button onClick={selectAll}>
            {t('configTransfer.export.selectAll', 'Select All')}
          </button>
          <button onClick={selectNone}>
            {t('configTransfer.export.selectNone', 'Select None')}
          </button>
        </div>
      </div>

      <div className="yolo-config-transfer-list">
        {EXPORTABLE_CONFIG_KEYS.map((item) => (
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
                {t('configTransfer.export.sensitive', 'Contains credentials')}
              </span>
            )}
          </label>
        ))}
      </div>

      <label className="yolo-config-transfer-option">
        <input
          type="checkbox"
          checked={redacted}
          onChange={(e) => setRedacted(e.target.checked)}
        />
        {t(
          'configTransfer.export.redactedOption',
          'Redact export (replace API keys / passwords / headers / environment variables with random strings)',
        )}
      </label>

      <div className="modal-button-container">
        <button className="mod-cta" onClick={() => void handleExport()}>
          {t('configTransfer.export.submit', 'Export')}
        </button>
        <button className="mod-cancel" onClick={onClose}>
          {t('configTransfer.export.cancel', 'Cancel')}
        </button>
      </div>
    </div>
  )
}
