import { migrateFrom58To59 } from './58_to_59'

describe('migrateFrom58To59', () => {
  it('sets chatOptions.ribbonClickAction to "sidebar" when missing', () => {
    const result = migrateFrom58To59({
      version: 58,
      chatOptions: { includeCurrentFileContent: true },
    })

    expect(result.version).toBe(59)
    const chatOptions = result.chatOptions as Record<string, unknown>
    expect(chatOptions.ribbonClickAction).toBe('sidebar')
    expect(chatOptions.includeCurrentFileContent).toBe(true)
  })

  it('preserves an existing ribbonClickAction value', () => {
    const result = migrateFrom58To59({
      version: 58,
      chatOptions: { ribbonClickAction: 'tab' },
    })

    const chatOptions = result.chatOptions as Record<string, unknown>
    expect(chatOptions.ribbonClickAction).toBe('tab')
  })

  it('creates chatOptions when entirely absent', () => {
    const result = migrateFrom58To59({ version: 58 })

    expect(result.version).toBe(59)
    const chatOptions = result.chatOptions as Record<string, unknown>
    expect(chatOptions.ribbonClickAction).toBe('sidebar')
  })
})
