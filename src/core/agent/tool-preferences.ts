import {
  Assistant,
  AssistantToolApprovalMode,
  AssistantToolDisclosureMode,
  AssistantToolPreference,
} from '../../types/assistant.types'
import {
  LOAD_TOOL_SCHEMAS_LOCAL_TOOL_NAME,
  LOCAL_FILE_TOOL_SHORT_NAMES,
  LOCAL_FS_SPLIT_ACTION_TOOL_NAMES,
  getLocalFileToolServerName,
} from '../mcp/localFileTools'
import { McpManager } from '../mcp/mcpManager'
import { parseToolName } from '../mcp/tool-name-utils'

export const DEFAULT_ASSISTANT_TOOL_APPROVAL_MODE: AssistantToolApprovalMode =
  'require_approval'
export const DEFAULT_ASSISTANT_TOOL_DISCLOSURE_MODE: AssistantToolDisclosureMode =
  'always'

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

const FULL_ACCESS_LOCAL_TOOLS: ReadonlySet<string> = new Set([
  LOAD_TOOL_SCHEMAS_LOCAL_TOOL_NAME,
])

/**
 * Built-in tools that default to **off** even when the user has never
 * customized preferences. Kept here as the single source of truth so both UI
 * and runtime read the same policy.
 */
export const BUILTIN_DEFAULT_DISABLED_TOOL_SHORT_NAMES: ReadonlySet<string> =
  new Set(['context_prune_tool_results', 'context_compact'])

/**
 * Full set of built-in tool FQNs that default to on. Derived from the local
 * tool short-name registry minus the deny-list above. Used by
 * `getEnabledAssistantToolNames` to fill in defaults for assistants whose
 * preferences have not yet been customized for a given tool — so a freshly
 * created default agent, or any agent loaded after a tool rename, gets the
 * correct enabled set without requiring a settings migration.
 */
const LOCAL_FILE_TOOL_SHORT_NAME_SET: ReadonlySet<string> = new Set(
  LOCAL_FILE_TOOL_SHORT_NAMES,
)

const BUILTIN_DEFAULT_ENABLED_TOOL_FQNS: readonly string[] =
  LOCAL_FILE_TOOL_SHORT_NAMES.filter(
    (shortName) => !BUILTIN_DEFAULT_DISABLED_TOOL_SHORT_NAMES.has(shortName),
  ).map(
    (shortName) =>
      `${getLocalFileToolServerName()}${McpManager.TOOL_NAME_DELIMITER}${shortName}`,
  )

const isLocalFileToolFqn = (toolName: string): boolean => {
  try {
    const { serverName } = parseToolName(toolName)
    return serverName === getLocalFileToolServerName()
  } catch {
    return false
  }
}

/**
 * Whether a tool defaults to enabled when an assistant's preferences contain
 * no explicit entry for it. Built-in `yolo_local__*` tools default on (modulo
 * the deny-list); third-party MCP tools default off (must be explicitly opted
 * in by the user).
 */
export const getDefaultEnabledForTool = (toolName: string): boolean => {
  try {
    const { serverName, toolName: shortName } = parseToolName(toolName)
    if (serverName !== getLocalFileToolServerName()) {
      return false
    }
    if (!LOCAL_FILE_TOOL_SHORT_NAME_SET.has(shortName)) {
      return false
    }
    return !BUILTIN_DEFAULT_DISABLED_TOOL_SHORT_NAMES.has(shortName)
  } catch {
    return false
  }
}

/**
 * Default disclosure mode for a tool when the user has not customized it.
 *
 * Built-in `yolo_local__*` tools default to `always`: they total ~3.9K tokens
 * across ~13 tools, stub-izing them saves little and only adds a first-use
 * latency hit. Third-party MCP server tools default to `on_demand` so large
 * MCP fleets don't bloat the cached `tools` prefix.
 *
 * `yolo_local__load_tool_schemas` itself is forced to `always` by `selectAllowedTools`
 * — without it the model has no way to disclose anything else — and the UI
 * locks its disclosure dropdown to match.
 */
export const getDefaultDisclosureModeForTool = (
  toolName: string,
): AssistantToolDisclosureMode => {
  try {
    const { serverName } = parseToolName(toolName)
    if (serverName === getLocalFileToolServerName()) {
      return 'always'
    }
    return 'on_demand'
  } catch {
    return DEFAULT_ASSISTANT_TOOL_DISCLOSURE_MODE
  }
}

export const getDefaultApprovalModeForTool = (
  toolName: string,
): AssistantToolApprovalMode => {
  try {
    const { serverName, toolName: parsedToolName } = parseToolName(toolName)
    if (serverName !== getLocalFileToolServerName()) {
      return 'require_approval'
    }

    if (FULL_ACCESS_LOCAL_TOOLS.has(parsedToolName)) {
      return 'full_access'
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
        disclosureMode: getDefaultDisclosureModeForTool(toolName),
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

/**
 * The set of tool FQNs that the runtime should treat as enabled for this
 * assistant. Merges explicitly-enabled preferences with default-on built-ins,
 * and honors the `includeBuiltinTools` master switch — when it is `false`, no
 * local built-in tool is included regardless of its preference, matching what
 * the runtime actually exposes.
 *
 * Does NOT consult `enableTools`; callers gate on that at a higher level so
 * the helper remains useful inside the editor (where the master switch may be
 * temporarily off while the user is staging changes).
 */
export const getEnabledAssistantToolNames = (
  assistant?: Pick<
    Assistant,
    'toolPreferences' | 'enabledToolNames' | 'includeBuiltinTools'
  > | null,
): string[] => {
  const toolPreferences = getAssistantToolPreferences(assistant)
  const includeBuiltinTools = assistant?.includeBuiltinTools !== false
  const result = new Set<string>()

  for (const [toolName, preference] of Object.entries(toolPreferences)) {
    if (!preference.enabled) continue
    if (!includeBuiltinTools && isLocalFileToolFqn(toolName)) continue
    result.add(toolName)
  }

  // Fill in default-on built-in tools that the assistant has not explicitly
  // customized. This is what makes a freshly created default agent and any
  // agent loaded after a built-in tool rename or addition see the right set
  // without requiring a settings migration.
  if (includeBuiltinTools) {
    for (const toolName of BUILTIN_DEFAULT_ENABLED_TOOL_FQNS) {
      if (!(toolName in toolPreferences)) {
        result.add(toolName)
      }
    }
  }

  return [...result]
}

/**
 * Subset of `getEnabledAssistantToolNames` that returns only tools the user
 * has *explicitly* turned on (i.e. `toolPreferences[name].enabled === true`).
 * Used by persistence paths to keep the legacy `enabledToolNames` array as a
 * snapshot of user intent rather than baking in derived defaults that should
 * stay implicit and re-derive at read time.
 */
export const getExplicitlyEnabledAssistantToolNames = (
  assistant?: Pick<Assistant, 'toolPreferences' | 'enabledToolNames'> | null,
): string[] => {
  const toolPreferences = getAssistantToolPreferences(assistant)
  return Object.entries(toolPreferences)
    .filter(([, preference]) => preference.enabled)
    .map(([toolName]) => toolName)
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

  return getDefaultEnabledForTool(toolName)
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

export const getAssistantToolDisclosureMode = (
  assistant:
    | Pick<Assistant, 'toolPreferences' | 'enabledToolNames'>
    | null
    | undefined,
  toolName: string,
  options?: { enableToolDisclosure?: boolean },
): AssistantToolDisclosureMode => {
  if (options?.enableToolDisclosure === false) {
    return 'always'
  }

  // Built-in tools are part of the agent's core capabilities (~3.9K tokens
  // total) and are always loaded. Disclosure is an MCP-only concept now;
  // any stale `on_demand` value in toolPreferences for a built-in is ignored.
  try {
    const { serverName } = parseToolName(toolName)
    if (serverName === getLocalFileToolServerName()) {
      return 'always'
    }
  } catch {
    // Fall through to default handling below.
  }

  const toolPreferences = getAssistantToolPreferences(assistant)
  return (
    toolPreferences[toolName]?.disclosureMode ??
    getDefaultDisclosureModeForTool(toolName)
  )
}
