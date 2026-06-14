import { AlertTriangle, X } from 'lucide-react'
import { Platform } from 'obsidian'
import type { ReactNode } from 'react'

import { useLanguage } from '../../contexts/language-context'
import { usePlugin } from '../../contexts/plugin-context'
import { normalizePluginVersion } from '../../core/update/updateChecker'
import { openCommunityPluginsSettings } from '../../core/update/openCommunityPluginsSettings'
import { useInstallationIncompleteBanner } from '../../hooks/useInstallationIncompleteBanner'
import { usePluginUpdate } from '../../hooks/usePluginUpdate'

export function InstallationIncompleteBanner(): ReactNode {
  const { t } = useLanguage()
  const plugin = usePlugin()
  const { app } = plugin
  const { detail, dismissed, dismiss } = useInstallationIncompleteBanner()
  const { state: updateState, canSelfUpdate, applyUpdate } =
    usePluginUpdate()

  if (!detail || dismissed) {
    return null
  }

  const { bakedVersion, manifestVersion } = detail
  const targetVersion = normalizePluginVersion(manifestVersion)
  const hasSelfUpdate = Platform.isDesktop && canSelfUpdate
  const isReadyForTarget =
    updateState.status === 'ready' && updateState.version === targetVersion
  const isDownloadingTarget =
    updateState.status === 'downloading' &&
    updateState.version === targetVersion
  const isApplyingTarget =
    updateState.status === 'applying' && updateState.version === targetVersion

  const title = t(
    'update.installationIncompleteTitle',
    'Plugin installation incomplete',
  )
  const meta = t(
    'update.installationIncompleteMeta',
    'main.js {bakedVersion} · manifest {manifestVersion}',
  )
    .replace('{bakedVersion}', bakedVersion)
    .replace('{manifestVersion}', manifestVersion)
  const notes = t(
    'update.installationIncompleteNotes',
    'This usually means main.js did not finish downloading during an update. Back up data.json, remove the plugin, and reinstall.',
  )
  const dismissLabel = t('update.dismiss', 'Dismiss')

  const resolveCtaLabel = (): string => {
    if (!hasSelfUpdate) {
      return t(
        'update.updateInCommunityPlugins',
        'Update in community plugins',
      )
    }
    if (isReadyForTarget) {
      return t('update.installAndReload', 'Install and reload')
    }
    if (isDownloadingTarget) {
      return t('update.downloading', 'Downloading {{progress}}%').replace(
        '{{progress}}',
        String(Math.round(updateState.progress)),
      )
    }
    if (isApplyingTarget) {
      return t('update.applying', 'Installing…')
    }
    return t('update.downloadUpdate', 'Download update')
  }

  const ctaDisabled = isDownloadingTarget || isApplyingTarget

  return (
    <div className="yolo-installation-incomplete-banner">
      <div className="yolo-installation-incomplete-banner-row">
        <div
          className="yolo-installation-incomplete-banner-icon"
          aria-hidden="true"
        >
          <AlertTriangle size={18} strokeWidth={2} />
        </div>
        <div className="yolo-installation-incomplete-banner-body">
          <div className="yolo-installation-incomplete-banner-title">
            {title}
          </div>
          <div className="yolo-installation-incomplete-banner-meta">{meta}</div>
          <div className="yolo-installation-incomplete-banner-notes">
            {notes}
          </div>
        </div>
        <button
          type="button"
          className="yolo-installation-incomplete-banner-dismiss"
          onClick={() => {
            dismiss()
          }}
          aria-label={dismissLabel}
        >
          <X size={16} strokeWidth={2.25} />
        </button>
      </div>
      <div className="yolo-installation-incomplete-banner-actions">
        <button
          type="button"
          className="mod-cta yolo-installation-incomplete-banner-cta"
          disabled={ctaDisabled}
          onClick={() => {
            if (!hasSelfUpdate) {
              openCommunityPluginsSettings(app)
              return
            }
            if (isReadyForTarget) {
              applyUpdate()
              return
            }
            void plugin.repairIncompleteInstallation()
          }}
        >
          {resolveCtaLabel()}
        </button>
      </div>
    </div>
  )
}
