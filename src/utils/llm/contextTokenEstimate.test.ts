import { estimateJsonTokens, estimateTextTokens } from './contextTokenEstimate'
import { formatTokenCount } from './formatTokenCount'

describe('contextTokenEstimate', () => {
  it('returns stable json token counts regardless of object key order', async () => {
    const left = await estimateJsonTokens({
      name: 'demo',
      inputSchema: {
        properties: {
          b: { type: 'string' },
          a: { type: 'number' },
        },
      },
    })
    const right = await estimateJsonTokens({
      inputSchema: {
        properties: {
          a: { type: 'number' },
          b: { type: 'string' },
        },
      },
      name: 'demo',
    })

    expect(left).toBe(right)
  })

  it('counts more tokens for longer text', async () => {
    expect(await estimateTextTokens('short')).toBeLessThan(
      await estimateTextTokens('short text with more details'),
    )
  })

  it('does not tokenize raw PDF base64 in native document parts', async () => {
    // Simulate a multi-MB PDF: 2M base64 chars would otherwise tokenize to
    // ~500k tokens. We want a stable per-page estimate instead.
    const fakeBase64 = 'A'.repeat(2_000_000)
    const withPdf = await estimateJsonTokens({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hi' },
            {
              type: 'document',
              mediaType: 'application/pdf',
              name: 'doc.pdf',
              data: fakeBase64,
              pageCount: 5,
            },
          ],
        },
      ],
    })
    // Should be on the order of the page-count estimate (~1500), not 500k+.
    expect(withPdf).toBeLessThan(5000)
    expect(withPdf).toBeGreaterThan(1000)
  })

  it('does not tokenize raw PDF base64 in OpenAI-compat file parts', async () => {
    const fakeBase64 = 'A'.repeat(2_000_000)
    const withPdf = await estimateJsonTokens({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: 'doc.pdf',
                file_data: `data:application/pdf;base64,${fakeBase64}`,
              },
            },
          ],
        },
      ],
    })
    expect(withPdf).toBeLessThan(5000)
  })

  it('does not tokenize bare data:application/pdf;base64 URLs', async () => {
    const fakeBase64 = 'A'.repeat(2_000_000)
    const withPdf = await estimateJsonTokens({
      url: `data:application/pdf;base64,${fakeBase64}`,
    })
    expect(withPdf).toBeLessThan(5000)
  })

  it('falls back to a flat estimate when pageCount is missing or invalid', async () => {
    const fakeBase64 = 'A'.repeat(2_000_000)
    const buildPdf = (pageCount: unknown) => ({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              mediaType: 'application/pdf',
              name: 'doc.pdf',
              data: fakeBase64,
              pageCount,
            },
          ],
        },
      ],
    })

    const noPageCount = await estimateJsonTokens(buildPdf(undefined))
    const infinitePages = await estimateJsonTokens(buildPdf(Infinity))
    const negativePages = await estimateJsonTokens(buildPdf(-3))

    // All should hit the flat fallback (~3000), not blow up to base64-tokenized.
    expect(noPageCount).toBeLessThan(5000)
    expect(infinitePages).toBeLessThan(5000)
    expect(negativePages).toBeLessThan(5000)
  })
})

describe('formatTokenCount', () => {
  it('formats compact token counts for display', () => {
    expect(formatTokenCount(512)).toBe('512')
    expect(formatTokenCount(1200)).toBe('1.2k')
    expect(formatTokenCount(12600)).toBe('13k')
  })
})
