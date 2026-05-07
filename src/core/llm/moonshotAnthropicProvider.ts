import {
  ContentBlockParam,
  MessageParam,
} from '@anthropic-ai/sdk/resources/messages'

import { RequestMessage } from '../../types/llm/request'

import { AnthropicProvider } from './anthropic'

// Kimi's Anthropic-compatible endpoint does not validate the authenticity of
// thinking block signatures; it only requires that a thinking block exists.
// Here we reuse the placeholder from the community proxy (abcpro1/kimi-proxy).
const PLACEHOLDER_SIGNATURE = 'c2lnbmF0dXJlX3BsYWNlaG9sZGVy'

export class MoonshotAnthropicProvider extends AnthropicProvider {
  protected parseRequestMessage(message: RequestMessage): MessageParam | null {
    const parsed = super.parseRequestMessage(message)
    if (
      !parsed ||
      parsed.role !== 'assistant' ||
      message.role !== 'assistant'
    ) {
      return parsed
    }

    const blocks = parsed.content as ContentBlockParam[]
    const hasToolUse = blocks.some((b) => b.type === 'tool_use')
    if (!hasToolUse) {
      return parsed
    }

    const reasoning =
      typeof message.reasoning === 'string' ? message.reasoning : ''

    const thinkingBlock: ContentBlockParam = {
      type: 'thinking',
      thinking: reasoning,
      signature: PLACEHOLDER_SIGNATURE,
    }

    return {
      role: 'assistant',
      content: [thinkingBlock, ...blocks],
    }
  }
}
