import { ChatModel } from '../../types/chat-model.types'

/**
 * Provider built-in (hosted / server-side) tools. These are executed on the
 * model provider's side and share the same request payload as function-calling
 * tools — but use provider-specific shapes. We carry them through the pipeline
 * as a small internal tagged union; each provider client picks out the family
 * it knows how to forward and ignores the rest.
 *
 * - `web_search`: OpenAI-style hosted web search. OpenAI-compatible gateways
 *   forward as `extra_body.tools=[{type:"web_search"}]`; OpenAI Responses maps
 *   to `tools=[{type:"web_search_preview"}]`.
 * - `openrouter:web_search`: OpenRouter's hosted web search. Carries optional
 *   `engine` (auto/native/exa/firecrawl/parallel) and `maxResults` (1–25),
 *   which the OpenRouter provider serializes to the server-tool entry
 *   `tools=[{type:"openrouter:web_search", parameters:{engine?, max_results?}}]`.
 * - `grok:live_search`: xAI Live Search. Serialized as
 *   `extra_body.search_parameters={mode:"auto", return_citations:true}` on the
 *   chat-completions endpoint.
 * - `gemini:web_search`: Gemini Google Search grounding. On the native Gemini
 *   transport it becomes `tools=[{googleSearch:{}}]`; on openai-compatible
 *   gateways (Vertex etc.) it becomes a synthetic `googleSearch` function tool.
 * - `gemini:url_context`: Gemini URL Context. On native Gemini becomes
 *   `tools=[{urlContext:{}}]`; on openai-compatible gateways it becomes a
 *   synthetic `urlContext` function tool.
 */
export type BuiltinProviderTool =
  | { type: 'web_search' }
  | {
      type: 'openrouter:web_search'
      engine?: 'auto' | 'native' | 'exa' | 'firecrawl' | 'parallel'
      maxResults?: number
    }
  | { type: 'grok:live_search' }
  | { type: 'gemini:web_search' }
  | { type: 'gemini:url_context' }

export function getBuiltinProviderTools(
  model: Pick<ChatModel, 'builtinToolProvider' | 'builtinTools'>,
): BuiltinProviderTool[] {
  switch (model.builtinToolProvider) {
    case 'gpt': {
      if (model.builtinTools?.gpt?.webSearch?.enabled) {
        return [{ type: 'web_search' }]
      }
      return []
    }
    case 'openrouter': {
      const cfg = model.builtinTools?.openrouter?.webSearch
      if (cfg?.enabled) {
        const tool: Extract<
          BuiltinProviderTool,
          { type: 'openrouter:web_search' }
        > = { type: 'openrouter:web_search' }
        // `auto` is the OpenRouter default — encode by omitting the field.
        if (cfg.engine && cfg.engine !== 'auto') {
          tool.engine = cfg.engine
        }
        if (typeof cfg.maxResults === 'number') {
          tool.maxResults = cfg.maxResults
        }
        return [tool]
      }
      return []
    }
    case 'grok': {
      if (model.builtinTools?.grok?.webSearch?.enabled) {
        return [{ type: 'grok:live_search' }]
      }
      return []
    }
    case 'gemini': {
      const tools: BuiltinProviderTool[] = []
      if (model.builtinTools?.gemini?.webSearch?.enabled) {
        tools.push({ type: 'gemini:web_search' })
      }
      if (model.builtinTools?.gemini?.urlContext?.enabled) {
        tools.push({ type: 'gemini:url_context' })
      }
      return tools
    }
    default:
      return []
  }
}
