import {
  ContentBlockParam,
  MessageParam,
} from '@anthropic-ai/sdk/resources/messages'

import { RequestMessage } from '../../types/llm/request'
import { LLMProvider } from '../../types/provider.types'
import { resolveDeepSeekAnthropicBaseUrl } from '../../utils/llm/provider-base-url'

import { AnthropicProvider } from './anthropic'

// DeepSeek's Anthropic-compatible endpoint in thinking mode + tool_use requires
// the previous turn's thinking block to be sent back with the assistant message.
// Similar to Kimi, it does not validate the signature's authenticity - it only
// requires the thinking block to be present. A placeholder is used here.
const PLACEHOLDER_SIGNATURE = 'c2lnbmF0dXJlX3BsYWNlaG9sZGVy'

export { resolveDeepSeekAnthropicBaseUrl }

export class DeepSeekAnthropicProvider extends AnthropicProvider {
  constructor(
    provider: LLMProvider,
    options?: ConstructorParameters<typeof AnthropicProvider>[1],
  ) {
    super(
      {
        ...provider,
        baseUrl: resolveDeepSeekAnthropicBaseUrl(provider.baseUrl),
      },
      options,
    )
  }

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
