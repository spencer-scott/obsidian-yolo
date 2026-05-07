import { useLanguage } from '../../../contexts/language-context'
import { useSettings } from '../../../contexts/settings-context'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianToggle } from '../../common/ObsidianToggle'

export function NotificationSettingsSection() {
  const { t } = useLanguage()
  const { settings, setSettings } = useSettings()

  const handleNotificationEnabledChange = (value: boolean) => {
    void (async () => {
      try {
        await setSettings({
          ...settings,
          notificationOptions: {
            ...settings.notificationOptions,
            enabled: value,
          },
        })
      } catch (error: unknown) {
        console.error('Failed to update notification enabled setting', error)
      }
    })()
  }

  const handleNotificationChannelChange = (value: string) => {
    if (value !== 'sound' && value !== 'system' && value !== 'both') {
      return
    }
    void (async () => {
      try {
        await setSettings({
          ...settings,
          notificationOptions: {
            ...settings.notificationOptions,
            channel: value,
          },
        })
      } catch (error: unknown) {
        console.error('Failed to update notification channel setting', error)
      }
    })()
  }

  const handleNotificationTimingChange = (value: string) => {
    if (value !== 'always' && value !== 'when-unfocused') {
      return
    }
    void (async () => {
      try {
        await setSettings({
          ...settings,
          notificationOptions: {
            ...settings.notificationOptions,
            timing: value,
          },
        })
      } catch (error: unknown) {
        console.error('Failed to update notification timing setting', error)
      }
    })()
  }

  const handleNotifyOnApprovalRequiredChange = (value: boolean) => {
    void (async () => {
      try {
        await setSettings({
          ...settings,
          notificationOptions: {
            ...settings.notificationOptions,
            notifyOnApprovalRequired: value,
          },
        })
      } catch (error: unknown) {
        console.error(
          'Failed to update approval required notification setting',
          error,
        )
      }
    })()
  }

  const handleNotifyOnTaskCompletedChange = (value: boolean) => {
    void (async () => {
      try {
        await setSettings({
          ...settings,
          notificationOptions: {
            ...settings.notificationOptions,
            notifyOnTaskCompleted: value,
          },
        })
      } catch (error: unknown) {
        console.error(
          'Failed to update task completed notification setting',
          error,
        )
      }
    })()
  }

  return (
    <div className="smtcmp-models-block-content">
      <ObsidianSetting
        name={t('settings.etc.notificationsEnabled', 'Enable notifications')}
        desc={t(
          'settings.etc.notificationsEnabledDesc',
          'Enable or disable reminders for Agent tasks.',
        )}
        className="smtcmp-models-select-card"
      >
        <ObsidianToggle
          value={settings.notificationOptions.enabled ?? false}
          onChange={handleNotificationEnabledChange}
        />
      </ObsidianSetting>
      {settings.notificationOptions.enabled && (
        <>
          <ObsidianSetting
            name={t('settings.etc.notificationChannel', 'Notification channel')}
            desc={t(
              'settings.etc.notificationChannelDesc',
              'Choose to use sound, system notifications, or both.',
            )}
            className="smtcmp-models-select-card"
          >
            <ObsidianDropdown
              value={settings.notificationOptions.channel ?? 'sound'}
              options={{
                sound: t('settings.etc.notificationChannelSound', 'Sound only'),
                system: t(
                  'settings.etc.notificationChannelSystem',
                  'System notification only',
                ),
                both: t(
                  'settings.etc.notificationChannelBoth',
                  'Sound + system notification',
                ),
              }}
              onChange={handleNotificationChannelChange}
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t('settings.etc.notificationTiming', 'Notification timing')}
            desc={t(
              'settings.etc.notificationTimingDesc',
              'Choose to always notify, or only when Obsidian is unfocused.',
            )}
            className="smtcmp-models-select-card"
          >
            <ObsidianDropdown
              value={settings.notificationOptions.timing ?? 'when-unfocused'}
              options={{
                always: t('settings.etc.notificationTimingAlways', 'Always notify'),
                'when-unfocused': t(
                  'settings.etc.notificationTimingWhenUnfocused',
                  'Only when unfocused',
                ),
              }}
              onChange={handleNotificationTimingChange}
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t(
              'settings.etc.notificationApprovalRequired',
              'Notify when approval required',
            )}
            desc={t(
              'settings.etc.notificationApprovalRequiredDesc',
              'Notify when YOLO pauses and waits for your approval on tool calls.',
            )}
            className="smtcmp-models-select-card"
          >
            <ObsidianToggle
              value={
                settings.notificationOptions.notifyOnApprovalRequired ?? true
              }
              onChange={handleNotifyOnApprovalRequiredChange}
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t('settings.etc.notificationTaskCompleted', 'Notify when task completed')}
            desc={t(
              'settings.etc.notificationTaskCompletedDesc',
              'Notify when the current Agent task ends and is no longer waiting for approval.',
            )}
            className="smtcmp-models-select-card"
          >
            <ObsidianToggle
              value={settings.notificationOptions.notifyOnTaskCompleted ?? true}
              onChange={handleNotifyOnTaskCompletedChange}
            />
          </ObsidianSetting>
        </>
      )}
    </div>
  )
}
