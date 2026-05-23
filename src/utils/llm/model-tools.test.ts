import { getBuiltinProviderTools } from './model-tools'

describe('getBuiltinProviderTools', () => {
  it('returns web_search when GPT web search is enabled', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'gpt',
        builtinTools: {
          gpt: { webSearch: { enabled: true } },
        },
      }),
    ).toEqual([{ type: 'web_search' }])
  })

  it('returns no tools when GPT web search is disabled', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'gpt',
        builtinTools: {
          gpt: { webSearch: { enabled: false } },
        },
      }),
    ).toEqual([])
  })

  it('returns openrouter:web_search when OpenRouter web search is enabled', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'openrouter',
        builtinTools: {
          openrouter: { webSearch: { enabled: true } },
        },
      }),
    ).toEqual([{ type: 'openrouter:web_search' }])
  })

  it('returns no tools when OpenRouter is selected but web search disabled', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'openrouter',
        builtinTools: {
          openrouter: { webSearch: { enabled: false } },
        },
      }),
    ).toEqual([])
  })

  it('returns gemini:web_search when the model-level Gemini toggle is on', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'gemini',
        builtinTools: {
          gemini: { webSearch: { enabled: true } },
        },
      }),
    ).toEqual([{ type: 'gemini:web_search' }])
  })

  it('returns both gemini tools when web search and URL context are enabled', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'gemini',
        builtinTools: {
          gemini: {
            webSearch: { enabled: true },
            urlContext: { enabled: true },
          },
        },
      }),
    ).toEqual([{ type: 'gemini:web_search' }, { type: 'gemini:url_context' }])
  })

  it('returns only gemini:url_context when URL context alone is enabled', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'gemini',
        builtinTools: {
          gemini: { urlContext: { enabled: true } },
        },
      }),
    ).toEqual([{ type: 'gemini:url_context' }])
  })

  it('returns no tools for gemini when the model-level toggle is off (still honors per-conversation overrides downstream)', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'gemini',
        builtinTools: {
          gpt: { webSearch: { enabled: true } },
          openrouter: { webSearch: { enabled: true } },
        },
      }),
    ).toEqual([])
  })

  it('returns grok:live_search when Grok web search is enabled', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'grok',
        builtinTools: {
          grok: { webSearch: { enabled: true } },
        },
      }),
    ).toEqual([{ type: 'grok:live_search' }])
  })

  it('carries through OpenRouter engine and maxResults when set', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'openrouter',
        builtinTools: {
          openrouter: {
            webSearch: { enabled: true, engine: 'exa', maxResults: 3 },
          },
        },
      }),
    ).toEqual([{ type: 'openrouter:web_search', engine: 'exa', maxResults: 3 }])
  })

  it('accepts the firecrawl and parallel engines', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'openrouter',
        builtinTools: {
          openrouter: { webSearch: { enabled: true, engine: 'firecrawl' } },
        },
      }),
    ).toEqual([{ type: 'openrouter:web_search', engine: 'firecrawl' }])
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'openrouter',
        builtinTools: {
          openrouter: { webSearch: { enabled: true, engine: 'parallel' } },
        },
      }),
    ).toEqual([{ type: 'openrouter:web_search', engine: 'parallel' }])
  })

  it('drops engine when set to auto (so OpenRouter picks the default)', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'openrouter',
        builtinTools: {
          openrouter: { webSearch: { enabled: true, engine: 'auto' } },
        },
      }),
    ).toEqual([{ type: 'openrouter:web_search' }])
  })

  it('returns no tools when builtinToolProvider is none or unset', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'none',
        builtinTools: { gpt: { webSearch: { enabled: true } } },
      }),
    ).toEqual([])
    expect(
      getBuiltinProviderTools({
        builtinTools: { gpt: { webSearch: { enabled: true } } },
      }),
    ).toEqual([])
  })

  it('does not leak GPT toggle to OpenRouter provider and vice versa', () => {
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'openrouter',
        builtinTools: { gpt: { webSearch: { enabled: true } } },
      }),
    ).toEqual([])
    expect(
      getBuiltinProviderTools({
        builtinToolProvider: 'gpt',
        builtinTools: { openrouter: { webSearch: { enabled: true } } },
      }),
    ).toEqual([])
  })
})
