import { migrateFrom55To56 } from './55_to_56'

describe('migrateFrom55To56', () => {
  it('drops debug.logModelRequestContext while preserving siblings', () => {
    const result = migrateFrom55To56({
      version: 55,
      debug: {
        logModelRequestContext: true,
        captureRawRequestDebug: true,
      },
    })

    expect(result.version).toBe(56)
    const debug = result.debug as Record<string, unknown>
    expect(debug.logModelRequestContext).toBeUndefined()
    expect(debug.captureRawRequestDebug).toBe(true)
  })

  it('is a no-op when debug.logModelRequestContext is absent', () => {
    const result = migrateFrom55To56({
      version: 55,
      debug: { captureRawRequestDebug: false },
    })

    expect(result.version).toBe(56)
    expect(
      (result.debug as Record<string, unknown>).captureRawRequestDebug,
    ).toBe(false)
  })

  it('tolerates missing debug object', () => {
    const result = migrateFrom55To56({ version: 55 })
    expect(result.version).toBe(56)
    expect(result.debug).toBeUndefined()
  })
})
