import { formatErrorMessageWithCauses } from './error-message'

describe('formatErrorMessageWithCauses', () => {
  it('includes nested causes behind generic wrapper errors', () => {
    const error = new Error('Connection error.') as Error & { cause?: unknown }
    error.cause = new TypeError(
      'LLM debug capture failed while reading request body.',
    )

    expect(formatErrorMessageWithCauses(error)).toBe(
      [
        'Connection error.',
        'Caused by: LLM debug capture failed while reading request body.',
      ].join('\n'),
    )
  })

  it('deduplicates repeated wrapper and cause messages', () => {
    const error = new Error('Failed') as Error & { cause?: unknown }
    error.cause = new Error('Failed')

    expect(formatErrorMessageWithCauses(error)).toBe('Failed')
  })
})
