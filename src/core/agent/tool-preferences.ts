import {
  Assistant,
  AssistantToolApprovalMode,
  AssistantToolPreference,
} from '../../types/assistant.types'
import {
  LOCAL_FS_SPLIT_ACTION_TOOL_NAMES,
  getLocalFileToolServerName,
} from '../mcp/localFileTools'
import { parseToolName } from '../mcp/tool-name-utils'

export const DEFAULT_ASSISTANT_TOOL_APPROVAL_MODE: AssistantToolApprovalMode =
  'require_approval'

/**
 * These tools are never allowed in "always-allow" mode.
 * The UI should hide the allowForThisChat button for these tools.
 */
export const ALWAYS_ALLOW_DISABLED_TOOL_NAMES: readonly string[] = [
  'delegate_external_agent',
]

/**
 * Set of local tool names that require approval.
 * delegate_external_agent is a high-risk tool (executes external CLI) and must be in this list.
 */
const REQUIRE_APPROVAL_LOCAL_TOOLS: ReadonlySet<string> = new Set([
  'fs_file_ops',
  ...LOCAL_FS_SPLIT_ACTION_TOOL_NAMES,
  'delegate_external_agent',
])

export const getDefaultApprovalModeForTool = (
  toolName: string,
): AssistantToolApprovalMode => {
  try {
    const { serverName, toolName: parsedToolName } = parseToolName(toolName)
    if (serverName !== getLocalFileToolServerName()) {
      return 'require_approval'
    }

    return REQUIRE_APPROVAL_LOCAL_TOOLS.has(parsedToolName)
      ? 'require_approval'
      : 'full_access'
  } catch {
    return DEFAULT_ASSISTANT_TOOL_APPROVAL_MODE
  }
}

export const buildAssistantToolPreferencesFromEnabledToolNames = (
  enabledToolNames?: string[],
): Record<string, AssistantToolPreference> => {
  if (!enabledToolNames || enabledToolNames.length === 0) {
    return {}
  }

  return enabledToolNames.reduce<Record<string, AssistantToolPreference>>(
    (acc, toolName) => {
      acc[toolName] = {
        enabled: true,
        approvalMode: getDefaultApprovalModeForTool(toolName),
      }
      return acc
    },
    {},
  )
}

export const getAssistantToolPreferences = (
  assistant?: Pick<Assistant, 'toolPreferences' | 'enabledToolNames'> | null,
): Record<string, AssistantToolPreference> => {
  const fromEnabledToolNames =
    buildAssistantToolPreferencesFromEnabledToolNames(
      assistant?.enabledToolNames,
    )

  return {
    ...fromEnabledToolNames,
    ...(assistant?.toolPreferences ?? {}),
  }
}

export const getEnabledAssistantToolNames = (
  assistant?: Pick<Assistant, 'toolPreferences' | 'enabledToolNames'> | null,
): string[] => {
  const toolPreferences = getAssistantToolPreferences(assistant)
  const enabledToolNames = Object.entries(toolPreferences)
    .filter(([, preference]) => preference.enabled)
    .map(([toolName]) => toolName)

  if (enabledToolNames.length > 0 || assistant?.toolPreferences) {
    return enabledToolNames
  }

  return assistant?.enabledToolNames ?? []
}

export const isAssistantToolEnabled = (
  assistant:
    | Pick<Assistant, 'toolPreferences' | 'enabledToolNames'>
    | null
    | undefined,
  toolName: string,
): boolean => {
  const toolPreferences = getAssistantToolPreferences(assistant)

  if (toolName in toolPreferences) {
    return toolPreferences[toolName]?.enabled ?? false
  }

  return assistant?.enabledToolNames?.includes(toolName) ?? false
}

export const getAssistantToolApprovalMode = (
  assistant:
    | Pick<Assistant, 'toolPreferences' | 'enabledToolNames'>
    | null
    | undefined,
  toolName: string,
): AssistantToolApprovalMode => {
  const toolPreferences = getAssistantToolPreferences(assistant)
  return (
    toolPreferences[toolName]?.approvalMode ??
    DEFAULT_ASSISTANT_TOOL_APPROVAL_MODE
  )
}
