import { ConfigKeyMeta } from './types'

/**
 * List of importable/exportable config keys and their metadata.
 * Organized by top-level keys in data.json.
 *
 * Display labels are resolved first via the i18n key `configTransfer.keyLabels.<key>`,
 * falling back to `fallbackLabel` (to avoid showing raw keys in untranslated locales
 * like Italian).
 *
 * Whether a key contains credentials is dynamically detected by `hasNonEmptyCredentials()`
 * on actual data, rather than using static flags here, since the same category
 * (e.g. mcp / providers) may or may not contain real credentials depending on the user's
 * configuration. Category-level labeling would be misleading.
 */
export const EXPORTABLE_CONFIG_KEYS: ConfigKeyMeta[] = [
  { key: 'providers', fallbackLabel: 'AI Providers' },
  { key: 'chatModels', fallbackLabel: 'Chat Models' },
  { key: 'embeddingModels', fallbackLabel: 'Embedding Models' },
  { key: 'chatModelId', fallbackLabel: 'Default Chat Model' },
  { key: 'chatTitleModelId', fallbackLabel: 'Title Generation Model' },
  { key: 'embeddingModelId', fallbackLabel: 'Default Embedding Model' },
  { key: 'systemPrompt', fallbackLabel: 'System Prompt' },
  { key: 'ragOptions', fallbackLabel: 'Knowledge Base Settings' },
  { key: 'mcp', fallbackLabel: 'MCP Tools' },
  { key: 'webSearch', fallbackLabel: 'Web Search' },
  { key: 'skills', fallbackLabel: 'Skills Settings' },
  { key: 'yolo', fallbackLabel: 'General Settings' },
  { key: 'debug', fallbackLabel: 'Debug Settings' },
  { key: 'chatOptions', fallbackLabel: 'Chat Preferences' },
  { key: 'notificationOptions', fallbackLabel: 'Notification Settings' },
  { key: 'continuationOptions', fallbackLabel: 'Continuation & Completion' },
  { key: 'assistants', fallbackLabel: 'Agent Configuration' },
  { key: 'currentAssistantId', fallbackLabel: 'Current Agent' },
  { key: 'quickAskAssistantId', fallbackLabel: 'Quick Ask Agent' },
]

/**
 * Internal fields excluded from import/export
 */
export const EXCLUDED_KEYS = new Set(['version', '__meta'])
