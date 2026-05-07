import { App } from 'obsidian'
import React from 'react'

import { useLanguage } from '../../../contexts/language-context'
import { useSettings } from '../../../contexts/settings-context'
import { selectionHighlightController } from '../../../features/editor/selection-highlight/selectionHighlightController'
import SmartComposerPlugin from '../../../main'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ChatPreferencesSection } from '../sections/ChatPreferencesSection'
import { EtcSection } from '../sections/EtcSection'

type OthersTabProps = {
  app: App
  plugin: SmartComposerPlugin
}

export function OthersTab({ app, plugin }: OthersTabProps) {
  const { t } = useLanguage()
  const { settings, setSettings } = useSettings()

  const handleMentionDisplayModeChange = (value: string) => {
    if (value !== 'inline' && value !== 'badge') return
    void (async () => {
      try {
        await setSettings({
          ...settings,
          chatOptions: {
            ...settings.chatOptions,
            mentionDisplayMode: value,
          },
        })
      } catch (error: unknown) {
        console.error('Failed to update mention display mode', error)
      }
    })()
  }

  const handleMentionContextModeChange = (value: string) => {
    if (value !== 'light' && value !== 'full') return
    void (async () => {
      try {
        await setSettings({
          ...settings,
          chatOptions: {
            ...settings.chatOptions,
            mentionContextMode: value,
          },
        })
      } catch (error: unknown) {
        console.error('Failed to update mention context mode', error)
      }
    })()
  }

  const handleChatApplyModeChange = (value: string) => {
    if (value !== 'review-required' && value !== 'direct-apply') return
    void (async () => {
      try {
        await setSettings({
          ...settings,
          chatOptions: {
            ...settings.chatOptions,
            chatApplyMode: value,
          },
        })
      } catch (error: unknown) {
        console.error('Failed to update chat apply mode', error)
      }
    })()
  }

  const handlePersistSelectionHighlightChange = (value: boolean) => {
    void (async () => {
      try {
        await setSettings({
          ...settings,
          continuationOptions: {
            ...settings.continuationOptions,
            persistSelectionHighlight: value,
          },
        })
        if (!value) {
          selectionHighlightController.clearAll()
        }
      } catch (error: unknown) {
        console.error('Failed to update selection highlight setting', error)
      }
    })()
  }

  const handleTabTitleFollowsConversationChange = (value: boolean) => {
    void (async () => {
      try {
        await setSettings({
          ...settings,
          chatOptions: {
            ...settings.chatOptions,
            tabTitleFollowsConversation: value,
          },
        })
      } catch (error: unknown) {
        console.error(
          'Failed to update chat tab title follow conversation setting',
          error,
        )
      }
    })()
  }

  return (
    <>
      <div className="smtcmp-settings-section">
        <ObsidianSetting
          name={t('settings.supportSmartComposer.name')}
          desc={t('settings.supportSmartComposer.desc')}
          heading
          className="smtcmp-settings-support-smart-composer"
        >
          <ObsidianButton
            text={t('settings.supportSmartComposer.buyMeACoffee')}
            onClick={() =>
              window.open('https://afdian.com/a/lapis0x0', '_blank')
            }
            cta
          />
        </ObsidianSetting>
      </div>

      <div className="smtcmp-settings-section smtcmp-settings-section--tight">
        <section className="smtcmp-settings-block">
          <div className="smtcmp-settings-block-head">
            <div className="smtcmp-settings-block-head-title-row">
              <div className="smtcmp-settings-sub-header smtcmp-settings-block-title">
                {t('settings.etc.interactionSectionTitle', 'Interaction')}
              </div>
            </div>
          </div>

          <div className="smtcmp-settings-block-content">
            <ObsidianSetting
              name={t('settings.etc.tabTitleFollowsConversation')}
              desc={t('settings.etc.tabTitleFollowsConversationDesc')}
              className="smtcmp-settings-card"
            >
              <ObsidianToggle
                value={settings.chatOptions.tabTitleFollowsConversation ?? true}
                onChange={handleTabTitleFollowsConversationChange}
              />
            </ObsidianSetting>
            <ObsidianSetting
              name={t('settings.etc.mentionDisplayMode', 'Mention display location')}
              desc={t(
                'settings.etc.mentionDisplayModeDesc',
                'Choose whether @ file mentions and / skill selections are displayed inline in the input box or as badges at the top of the input box.',
              )}
              className="smtcmp-settings-card"
            >
              <ObsidianDropdown
                value={settings.chatOptions.mentionDisplayMode ?? 'inline'}
                options={{
                  inline: t(
                    'settings.etc.mentionDisplayModeInline',
                    'Inline',
                  ),
                  badge: t('settings.etc.mentionDisplayModeBadge', 'Top badges'),
                }}
                onChange={handleMentionDisplayModeChange}
              />
            </ObsidianSetting>
            <ObsidianSetting
              name={t(
                'settings.etc.mentionContextMode',
                '@ File context injection mode',
              )}
              desc={t(
                'settings.etc.mentionContextModeDesc',
                'Controls how @ file content is injected into the model. In light mode, only the file path, note properties, and Markdown structure are injected, encouraging the Agent to read only what is necessary.',
              )}
              className="smtcmp-settings-card"
            >
              <ObsidianDropdown
                value={settings.chatOptions.mentionContextMode ?? 'light'}
                options={{
                  light: t('settings.etc.mentionContextModeLight', 'Light mode'),
                  full: t('settings.etc.mentionContextModeFull', 'Full mode'),
                }}
                onChange={handleMentionContextModeChange}
              />
            </ObsidianSetting>
            <ObsidianSetting
              name={t('settings.etc.chatApplyMode', 'Chat apply mode')}
              desc={t(
                'settings.etc.chatApplyModeDesc',
                'Only affects “Apply” in the Chat sidebar. Choose to enter inline review first, or write directly to the file. When review is disabled, clicking Apply will no longer require a second approval.',
              )}
              className="smtcmp-settings-card"
            >
              <ObsidianDropdown
                value={settings.chatOptions.chatApplyMode ?? 'review-required'}
                options={{
                  'review-required': t(
                    'settings.etc.chatApplyModeReviewRequired',
                    'Review before applying',
                  ),
                  'direct-apply': t(
                    'settings.etc.chatApplyModeDirectApply',
                    'Write directly to file',
                  ),
                }}
                onChange={handleChatApplyModeChange}
              />
            </ObsidianSetting>
            <ObsidianSetting
              name={t(
                'settings.etc.persistSelectionHighlight',
                'Persist selection block highlight',
              )}
              desc={t(
                'settings.etc.persistSelectionHighlightDesc',
                'Persistently display block-level highlighting of selected content in the editor during sidebar Chat or Quick Ask interactions.',
              )}
              className="smtcmp-settings-card"
            >
              <ObsidianToggle
                value={
                  settings.continuationOptions.persistSelectionHighlight ?? true
                }
                onChange={handlePersistSelectionHighlightChange}
              />
            </ObsidianSetting>

            <ChatPreferencesSection embedded />
          </div>
        </section>
      </div>

      <EtcSection
        app={app}
        plugin={plugin}
        className="smtcmp-settings-section--tight"
      />
    </>
  )
}
