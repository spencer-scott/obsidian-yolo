import { App, Platform } from 'obsidian'

import { useLanguage } from '../../../contexts/language-context'
import { useSettings } from '../../../contexts/settings-context'
import { selectionHighlightController } from '../../../features/editor/selection-highlight/selectionHighlightController'
import { Language } from '../../../i18n'
import YoloPlugin from '../../../main'
import { openExternalLink } from '../../../utils/openExternalLink'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ChatPreferencesSection } from '../sections/ChatPreferencesSection'
import { EtcSection } from '../sections/EtcSection'

const YOLO_REPO_URL = 'https://github.com/Lapis0x0/obsidian-yolo'

function detectGithubIssueOs(): 'Windows' | 'macOS' | 'Linux' | 'Other' {
  if (Platform.isMacOS) return 'macOS'
  if (Platform.isWin) return 'Windows'
  if (Platform.isLinux) return 'Linux'
  return 'Other'
}

function buildBugReportUrl(pluginVersion: string, language: Language): string {
  const template = language === 'zh' ? 'bug_report_zh.yml' : 'bug_report.yml'
  const params = new URLSearchParams({
    template,
    'plugin-version': pluginVersion,
    os: detectGithubIssueOs(),
  })
  return `${YOLO_REPO_URL}/issues/new?${params.toString()}`
}

function buildFeatureRequestUrl(language: Language): string {
  const template =
    language === 'zh' ? 'feature_request_zh.yml' : 'feature_request.yml'
  return `${YOLO_REPO_URL}/issues/new?template=${template}`
}

type OthersTabProps = {
  app: App
  plugin: YoloPlugin
}

export function OthersTab({ app, plugin }: OthersTabProps) {
  const { t, language } = useLanguage()
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

  const handleChatExportIncludeThinkingChange = (value: boolean) => {
    void (async () => {
      try {
        await setSettings({
          ...settings,
          chatOptions: {
            ...settings.chatOptions,
            chatExportIncludeThinking: value,
          },
        })
      } catch (error: unknown) {
        console.error('Failed to update chat export thinking setting', error)
      }
    })()
  }

  const handleChatExportIncludeToolCallsChange = (value: boolean) => {
    void (async () => {
      try {
        await setSettings({
          ...settings,
          chatOptions: {
            ...settings.chatOptions,
            chatExportIncludeToolCalls: value,
          },
        })
      } catch (error: unknown) {
        console.error('Failed to update chat export tool calls setting', error)
      }
    })()
  }

  const handleRibbonClickActionChange = (value: string) => {
    if (
      value !== 'sidebar' &&
      value !== 'tab' &&
      value !== 'split' &&
      value !== 'window' &&
      value !== 'last'
    ) {
      return
    }
    if (value === 'window' && !Platform.isDesktop) return
    void (async () => {
      try {
        await setSettings({
          ...settings,
          chatOptions: {
            ...settings.chatOptions,
            ribbonClickAction: value,
          },
        })
      } catch (error: unknown) {
        console.error('Failed to update ribbon click action', error)
      }
    })()
  }

  return (
    <>
      <div className="yolo-settings-section">
        <ObsidianSetting
          name={t('settings.supportYolo.name')}
          desc={t('settings.supportYolo.desc')}
          heading
          className="yolo-settings-support-yolo"
        >
          <ObsidianButton
            text={t('settings.supportYolo.buyMeACoffee')}
            onClick={() => openExternalLink('https://afdian.com/a/lapis0x0')}
            cta
          />
          <ObsidianButton
            text={t('settings.supportYolo.reportBug')}
            onClick={() =>
              openExternalLink(
                buildBugReportUrl(plugin.manifest.version, language),
              )
            }
          />
          <ObsidianButton
            text={t('settings.supportYolo.featureRequest')}
            onClick={() => openExternalLink(buildFeatureRequestUrl(language))}
          />
        </ObsidianSetting>
      </div>

      <div className="yolo-settings-section yolo-settings-section--tight">
        <section className="yolo-settings-block">
          <div className="yolo-settings-block-head">
            <div className="yolo-settings-block-head-title-row">
              <div className="yolo-settings-sub-header yolo-settings-block-title">
                {t('settings.etc.interactionSectionTitle', 'Interaction')}
              </div>
            </div>
          </div>

          <div className="yolo-settings-block-content">
            <ObsidianSetting
              name={t(
                'settings.etc.ribbonClickAction',
                'Ribbon icon click location',
              )}
              desc={t(
                'settings.etc.ribbonClickActionDesc',
                'Choose where the Chat view opens when clicking the YOLO icon in the left ribbon. If a Chat view already exists at the selected location, it will be activated and reused; otherwise a new one is created.',
              )}
              className="yolo-settings-card"
            >
              <ObsidianDropdown
                value={settings.chatOptions.ribbonClickAction ?? 'sidebar'}
                options={{
                  sidebar: t(
                    'settings.etc.ribbonClickActionSidebar',
                    'Right sidebar',
                  ),
                  tab: t('settings.etc.ribbonClickActionTab', 'New tab'),
                  split: t(
                    'settings.etc.ribbonClickActionSplit',
                    'Right split',
                  ),
                  ...(Platform.isDesktop
                    ? {
                        window: t(
                          'settings.etc.ribbonClickActionWindow',
                          'Standalone window',
                        ),
                      }
                    : {}),
                  last: t(
                    'settings.etc.ribbonClickActionLast',
                    'Last used location',
                  ),
                }}
                onChange={handleRibbonClickActionChange}
              />
            </ObsidianSetting>
            <ObsidianSetting
              name={t(
                'settings.etc.mentionDisplayMode',
                'Mention display location',
              )}
              desc={t(
                'settings.etc.mentionDisplayModeDesc',
                'Choose whether @ file mentions and / skill selections are displayed inline in the input box or as badges at the top of the input box.',
              )}
              className="yolo-settings-card"
            >
              <ObsidianDropdown
                value={settings.chatOptions.mentionDisplayMode ?? 'inline'}
                options={{
                  inline: t('settings.etc.mentionDisplayModeInline', 'Inline'),
                  badge: t(
                    'settings.etc.mentionDisplayModeBadge',
                    'Top badges',
                  ),
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
              className="yolo-settings-card"
            >
              <ObsidianDropdown
                value={settings.chatOptions.mentionContextMode ?? 'light'}
                options={{
                  light: t(
                    'settings.etc.mentionContextModeLight',
                    'Light mode',
                  ),
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
              className="yolo-settings-card"
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
              className="yolo-settings-card"
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

      <div className="yolo-settings-section yolo-settings-section--tight">
        <section className="yolo-settings-block">
          <div className="yolo-settings-block-head">
            <div className="yolo-settings-block-head-title-row">
              <div className="yolo-settings-sub-header yolo-settings-block-title">
                {t('settings.etc.chatExportSubsectionTitle', 'Chat export')}
              </div>
            </div>
          </div>

          <div className="yolo-settings-block-content">
            <ObsidianSetting
              name={t(
                'settings.etc.chatExportIncludeThinking',
                'Export thinking process',
              )}
              desc={t(
                'settings.etc.chatExportIncludeThinkingDesc',
                'Include assistant reasoning blocks in exported chat markdown.',
              )}
              className="yolo-settings-card"
            >
              <ObsidianToggle
                value={settings.chatOptions.chatExportIncludeThinking ?? false}
                onChange={handleChatExportIncludeThinkingChange}
              />
            </ObsidianSetting>
            <ObsidianSetting
              name={t(
                'settings.etc.chatExportIncludeToolCalls',
                'Export tool calls',
              )}
              desc={t(
                'settings.etc.chatExportIncludeToolCallsDesc',
                'Include tool call arguments and results in exported chat markdown.',
              )}
              className="yolo-settings-card"
            >
              <ObsidianToggle
                value={settings.chatOptions.chatExportIncludeToolCalls ?? false}
                onChange={handleChatExportIncludeToolCallsChange}
              />
            </ObsidianSetting>
          </div>
        </section>
      </div>

      <EtcSection
        app={app}
        plugin={plugin}
        className="yolo-settings-section--tight"
      />
    </>
  )
}
