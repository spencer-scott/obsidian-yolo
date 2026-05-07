// Synthesize an internal async dispatch result message (ChatExternalAgentResultMessage)
// into a regular ChatToolMessage, feeding it to the <ToolMessage> component to reuse
// the full UI (collapsible header, headline summary, expanded ExternalAgentToolCard, etc.).
//
// This way the visual appearance of async results is identical to synchronously completed
// tool cards. The only difference is the status badge shows "completed / failed / cancelled / timed out"
// instead of "running".

import { getLocalFileToolServerName } from '../../../core/mcp/localFileTools'
import { getToolName } from '../../../core/mcp/tool-name-utils'
import type {
  ChatExternalAgentResultMessage,
  ChatToolMessage,
} from '../../../types/chat'
import {
  type ToolCallRequest,
  type ToolCallResponse,
  ToolCallResponseStatus,
} from '../../../types/tool-call.types'

export function buildSynthToolMessageFromResult(
  message: ChatExternalAgentResultMessage,
): ChatToolMessage {
  const request = buildSynthRequest(message)
  const response = buildSynthResponse(message)
  return {
    role: 'tool',
    id: message.id,
    toolCalls: [{ request, response }],
  }
}

function buildSynthRequest(
  message: ChatExternalAgentResultMessage,
): ToolCallRequest {
  // Use taskId as toolCallId - will not match stream bus snapshot, naturally falls back.
  // arguments only contain provider + a short prompt (title), so headline summary
  // can compose "{provider} | {title}" instead of the raw first 80 chars of stdout.
  return {
    id: `result-${message.taskId}`,
    // Must use the full server-qualified name (e.g. yolo_local__delegate_external_agent),
    // otherwise ToolMessage's parseToolName / displayNames cannot find the friendly label,
    // and the headline will degrade to the raw tool name.
    name: getToolName(getLocalFileToolServerName(), 'delegate_external_agent'),
    arguments: {
      kind: 'complete',
      value: {
        provider: message.provider,
        prompt: message.title,
      },
    },
  }
}

function buildSynthResponse(
  message: ChatExternalAgentResultMessage,
): ToolCallResponse {
  const stdout = message.stdout ?? ''
  const stderr = message.stderr ?? ''
  // ExternalAgentToolCard in the fallback path only reads response.data.text,
  // so prepend stderr as progress context before stdout, separated by ---.
  const combined =
    stderr && stdout ? `${stderr}\n---\n${stdout}` : stderr || stdout

  switch (message.status) {
    case 'completed':
      return {
        status: ToolCallResponseStatus.Success,
        data: { type: 'text', text: combined },
      }
    case 'cancelled':
    case 'killed_by_shutdown':
      return {
        status: ToolCallResponseStatus.Aborted,
        data: combined ? { type: 'text', text: combined } : undefined,
      }
    case 'timed_out': {
      const prefix = `Timed out${
        message.exitCode != null ? ` (exit ${message.exitCode})` : ''
      }.`
      return {
        status: ToolCallResponseStatus.Error,
        error: combined ? `${prefix}\n${combined}` : prefix,
      }
    }
    case 'failed': {
      const prefix =
        message.exitCode != null
          ? `Failed (exit ${message.exitCode}).`
          : 'Failed.'
      return {
        status: ToolCallResponseStatus.Error,
        error: combined ? `${prefix}\n${combined}` : prefix,
      }
    }
  }
}
