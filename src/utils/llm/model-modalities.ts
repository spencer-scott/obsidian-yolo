import {
  CHAT_MODEL_MODALITIES,
  ChatModel,
  ChatModelModality,
} from '../../types/chat-model.types'
import { LLMProvider } from '../../types/provider.types'

export { CHAT_MODEL_MODALITIES }
export type { ChatModelModality }

/**
 * Default modalities inferred from provider apiType, used when a new chat model
 * is first created via the settings modal. For unknown / openai-compatible
 * providers we stay conservative (text only) — the user can toggle vision/pdf
 * on for their specific model.
 *
 * Native PDF input ('pdf' modality) is only defaulted on for the official
 * Anthropic and Gemini API surfaces. Anthropic-/Gemini-compatible third-party
 * proxies (OpenRouter, MiniMax, GLM, etc.) frequently route via openai-compatible
 * here, so users on those will explicitly opt in if their proxy supports it.
 */
export function resolveDefaultChatModelModalities(
  provider: LLMProvider | undefined,
): ChatModelModality[] {
  if (!provider) return ['text']
  switch (provider.apiType) {
    case 'anthropic':
    case 'gemini':
      return ['text', 'vision', 'pdf']
    case 'amazon-bedrock':
    case 'openai-responses':
      return ['text', 'vision']
    case 'openai-compatible':
    default:
      return ['text']
  }
}

function getModalities(
  model: ChatModel | null | undefined,
): ChatModelModality[] {
  return model?.modalities && model.modalities.length > 0
    ? model.modalities
    : (['text'] as ChatModelModality[])
}

/**
 * Settings migration (see `migrations/48_to_49.ts`) backfills this field for
 * every ChatModel using `resolveDefaultChatModelModalities`, so by the time
 * this gate runs the array is always populated. The `?? ['text']` branch is
 * the ultra-defensive fallback for a model that somehow bypassed migration.
 */
export function chatModelSupportsVision(
  model: ChatModel | null | undefined,
): boolean {
  return getModalities(model).includes('vision')
}

/**
 * Whether the model accepts native PDF document input (Gemini inlineData /
 * Anthropic document block). When false, the request pipeline strips PDF
 * document parts and replaces them with extracted plain text before the
 * adapter sees the messages.
 */
export function chatModelSupportsPdf(
  model: ChatModel | null | undefined,
): boolean {
  return getModalities(model).includes('pdf')
}
