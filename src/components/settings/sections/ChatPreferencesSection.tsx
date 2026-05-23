import { useEffect, useState } from 'react'

import { useLanguage } from '../../../contexts/language-context'
import { useSettings } from '../../../contexts/settings-context'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'

import { FontScaleSlider } from './FontScaleSlider'

const HISTORY_ARCHIVE_THRESHOLD_MIN = 20
const HISTORY_ARCHIVE_THRESHOLD_MAX = 500
const HISTORY_ARCHIVE_THRESHOLD_FALLBACK = 50

type ChatPreferencesSectionProps = {
  embedded?: boolean
}

export function ChatPreferencesSection({
  embedded = false,
}: ChatPreferencesSectionProps) {
  const { settings, setSettings } = useSettings()
  const { t } = useLanguage()
  const [historyArchiveThresholdInput, setHistoryArchiveThresholdInput] =
    useState(
      String(
        settings.chatOptions.historyArchiveThreshold ??
          HISTORY_ARCHIVE_THRESHOLD_FALLBACK,
      ),
    )

  useEffect(() => {
    setHistoryArchiveThresholdInput(
      String(
        settings.chatOptions.historyArchiveThreshold ??
          HISTORY_ARCHIVE_THRESHOLD_FALLBACK,
      ),
    )
  }, [settings.chatOptions.historyArchiveThreshold])

  const updateChatOptions = (
    patch: Partial<typeof settings.chatOptions>,
    context: string,
  ) => {
    void (async () => {
      try {
        await setSettings({
          ...settings,
          chatOptions: {
            ...settings.chatOptions,
            ...patch,
          },
        })
      } catch (error: unknown) {
        console.error(`Failed to update chat options: ${context}`, error)
      }
    })()
  }

  const settingsContent = (
    <>
      <ObsidianSetting
        name={t('settings.chatPreferences.chatFontScale')}
        desc={t('settings.chatPreferences.chatFontScaleDesc')}
        className="yolo-settings-card"
      >
        <FontScaleSlider
          value={settings.chatOptions.chatFontScale ?? 1}
          onChange={(value) => {
            updateChatOptions(
              { chatFontScale: value === 1 ? undefined : value },
              'chatFontScale',
            )
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.chatPreferences.historyArchiveEnabled')}
        desc={t('settings.chatPreferences.historyArchiveEnabledDesc')}
        className="yolo-settings-card"
      >
        <ObsidianToggle
          value={settings.chatOptions.historyArchiveEnabled ?? true}
          onChange={(value) => {
            updateChatOptions(
              {
                historyArchiveEnabled: value,
              },
              'historyArchiveEnabled',
            )
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.chatPreferences.historyArchiveThreshold')}
        desc={t('settings.chatPreferences.historyArchiveThresholdDesc')}
        className="yolo-settings-card"
      >
        <ObsidianTextInput
          value={historyArchiveThresholdInput}
          type="number"
          onChange={(value) => {
            setHistoryArchiveThresholdInput(value)
          }}
          onBlur={(value) => {
            const parsed = Number.parseInt(value, 10)
            if (Number.isNaN(parsed)) {
              setHistoryArchiveThresholdInput(
                String(
                  settings.chatOptions.historyArchiveThreshold ??
                    HISTORY_ARCHIVE_THRESHOLD_FALLBACK,
                ),
              )
              return
            }
            const clamped = Math.max(
              HISTORY_ARCHIVE_THRESHOLD_MIN,
              Math.min(HISTORY_ARCHIVE_THRESHOLD_MAX, parsed),
            )
            setHistoryArchiveThresholdInput(String(clamped))
            if (clamped !== settings.chatOptions.historyArchiveThreshold) {
              updateChatOptions(
                {
                  historyArchiveThreshold: clamped,
                },
                'historyArchiveThreshold',
              )
            }
          }}
        />
      </ObsidianSetting>
    </>
  )

  if (embedded) return settingsContent

  return (
    <div className="yolo-settings-section">
      <section className="yolo-settings-block">
        <div className="yolo-settings-block-head">
          <div className="yolo-settings-block-head-title-row">
            <div className="yolo-settings-sub-header yolo-settings-block-title">
              {t('settings.chatPreferences.title')}
            </div>
          </div>
        </div>

        <div className="yolo-settings-block-content">{settingsContent}</div>
      </section>
    </div>
  )
}
