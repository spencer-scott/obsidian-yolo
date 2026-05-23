import { migrateFrom51To52 } from './51_to_52'

describe('migrateFrom51To52', () => {
  it('renames toolType to builtinToolProvider and folds gptTools into builtinTools.gpt', () => {
    const result = migrateFrom51To52({
      version: 51,
      chatModels: [
        {
          id: 'model-gpt',
          toolType: 'gpt',
          gptTools: { webSearch: { enabled: true } },
        },
        {
          id: 'model-gemini',
          toolType: 'gemini',
        },
        {
          id: 'model-none',
          toolType: 'none',
        },
      ],
    })

    expect(result.version).toBe(52)
    expect(Array.isArray(result.chatModels)).toBe(true)
    if (!Array.isArray(result.chatModels)) throw new Error('not array')

    const [m1, m2, m3] = result.chatModels as Array<Record<string, unknown>>

    expect(m1.builtinToolProvider).toBe('gpt')
    expect(m1.builtinTools).toEqual({ gpt: { webSearch: { enabled: true } } })
    expect('toolType' in m1).toBe(false)
    expect('gptTools' in m1).toBe(false)

    expect(m2.builtinToolProvider).toBe('gemini')
    expect('toolType' in m2).toBe(false)
    expect(m2.builtinTools).toBeUndefined()

    expect(m3.builtinToolProvider).toBe('none')
  })

  it('handles models without legacy fields', () => {
    const result = migrateFrom51To52({
      version: 51,
      chatModels: [{ id: 'model-x' }],
    })

    expect(result.version).toBe(52)
    if (!Array.isArray(result.chatModels)) throw new Error('not array')
    const [m] = result.chatModels as Array<Record<string, unknown>>
    expect('toolType' in m).toBe(false)
    expect('builtinToolProvider' in m).toBe(false)
  })

  it('no-ops when chatModels is missing', () => {
    const result = migrateFrom51To52({ version: 51 })
    expect(result.version).toBe(52)
  })

  it('drops invalid toolType values', () => {
    const result = migrateFrom51To52({
      version: 51,
      chatModels: [{ id: 'x', toolType: 'weird-value' }],
    })
    if (!Array.isArray(result.chatModels)) throw new Error('not array')
    const [m] = result.chatModels as Array<Record<string, unknown>>
    expect('toolType' in m).toBe(false)
    expect('builtinToolProvider' in m).toBe(false)
  })

  it('preserves sibling keys in pre-existing builtinTools while overwriting .gpt with legacy gptTools', () => {
    // Hand-edited/synced raw data already carrying a partial builtinTools.
    // This is the documented tradeoff: legacy gptTools is the authoritative
    // v51 source, so .gpt is overwritten; .openrouter (an out-of-band sibling)
    // is preserved.
    const result = migrateFrom51To52({
      version: 51,
      chatModels: [
        {
          id: 'm',
          gptTools: { webSearch: { enabled: true } },
          builtinTools: {
            gpt: { webSearch: { enabled: false } },
            openrouter: { webSearch: { enabled: true } },
          },
        },
      ],
    })
    if (!Array.isArray(result.chatModels)) throw new Error('not array')
    const [m] = result.chatModels as Array<Record<string, unknown>>
    expect(m.builtinTools).toEqual({
      gpt: { webSearch: { enabled: true } }, // overwritten by legacy
      openrouter: { webSearch: { enabled: true } }, // sibling preserved
    })
    expect('gptTools' in m).toBe(false)
  })
})
