import type { ChatMessage } from '../../types/chat'
import { ToolCallResponseStatus } from '../../types/tool-call.types'

import { NativeAgentRuntime } from './native-runtime'
import { shouldProceedToToolPhase } from './tool-phase'
import type { AgentRuntimeLoopConfig } from './types'

describe('shouldProceedToToolPhase', () => {
  it('returns true when tool call requests exist even if model terminated', () => {
    const turnResult = {
      toolCallRequests: [{ id: 'call-1' }],
      modelTerminated: true,
    }
    const result = shouldProceedToToolPhase(turnResult)

    expect(result).toBe(true)
  })

  it('returns false when tool call requests are empty', () => {
    const turnResult = {
      toolCallRequests: [],
      modelTerminated: false,
    }
    const result = shouldProceedToToolPhase(turnResult)

    expect(result).toBe(false)
  })
})

describe('NativeAgentRuntime tool-call helpers', () => {
  const makeLoopConfig = (): AgentRuntimeLoopConfig => ({
    enableTools: true,
    includeBuiltinTools: true,
    maxAutoIterations: 10,
  })

  const makeToolMessage = (
    toolCallId: string,
    status: ToolCallResponseStatus = ToolCallResponseStatus.PendingApproval,
  ): ChatMessage => ({
    role: 'tool',
    id: 'tool-msg-1',
    metadata: {},
    toolCalls: [
      {
        request: {
          id: toolCallId,
          name: 'yolo_local__fs_edit',
          arguments: undefined,
        },
        response:
          status === ToolCallResponseStatus.Success
            ? {
                status,
                data: { type: 'text', text: 'ok' },
              }
            : status === ToolCallResponseStatus.Error
              ? { status, error: 'boom' }
              : { status },
      },
    ],
  })

  // Cast to a structurally-equivalent shape to seed the runtime's private
  // `messages` for unit testing approval-routing helpers in isolation.
  // Production code never touches the runtime this way; everything goes
  // through `run()`.
  const seedMessages = (
    runtime: NativeAgentRuntime,
    messages: ChatMessage[],
  ): void => {
    ;(runtime as unknown as { messages: ChatMessage[] }).messages = messages
  }

  it('findToolCall locates a tool call by id', () => {
    const runtime = new NativeAgentRuntime(makeLoopConfig())
    seedMessages(runtime, [makeToolMessage('call-1')])

    const located = runtime.findToolCall('call-1')
    expect(located).not.toBeNull()
    expect(located?.toolCall.request.id).toBe('call-1')
    expect(located?.toolCall.response.status).toBe(
      ToolCallResponseStatus.PendingApproval,
    )
  })

  it('findToolCall returns null when no message contains the id', () => {
    const runtime = new NativeAgentRuntime(makeLoopConfig())
    seedMessages(runtime, [makeToolMessage('call-1')])

    expect(runtime.findToolCall('missing')).toBeNull()
  })

  it('setToolCallResponse patches the matching call and notifies subscribers', () => {
    const runtime = new NativeAgentRuntime(makeLoopConfig())
    seedMessages(runtime, [makeToolMessage('call-1')])

    const subscriber = jest.fn()
    runtime.subscribe(subscriber)

    const patched = runtime.setToolCallResponse('call-1', {
      status: ToolCallResponseStatus.Success,
      data: { type: 'text', text: 'done' },
    })

    expect(patched).toBe(true)
    expect(subscriber).toHaveBeenCalledTimes(1)

    const after = runtime.findToolCall('call-1')
    expect(after?.toolCall.response.status).toBe(ToolCallResponseStatus.Success)
  })

  it('setToolCallResponse returns false when no message contains the id', () => {
    const runtime = new NativeAgentRuntime(makeLoopConfig())
    seedMessages(runtime, [makeToolMessage('call-1')])

    const subscriber = jest.fn()
    runtime.subscribe(subscriber)

    const patched = runtime.setToolCallResponse('missing', {
      status: ToolCallResponseStatus.Rejected,
    })

    expect(patched).toBe(false)
    expect(subscriber).not.toHaveBeenCalled()
  })
})
