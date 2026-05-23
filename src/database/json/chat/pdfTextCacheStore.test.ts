import {
  buildPdfTextCacheKey,
  buildPdfTextCacheKeyFromContent,
} from './pdfTextCacheStore'

describe('buildPdfTextCacheKey (path-based)', () => {
  it('produces stable hex for the same path/mtime/size triple', () => {
    expect(buildPdfTextCacheKey('a/b.pdf', 100, 200)).toEqual(
      buildPdfTextCacheKey('a/b.pdf', 100, 200),
    )
  })

  it('changes when any tuple component changes', () => {
    const base = buildPdfTextCacheKey('a/b.pdf', 100, 200)
    expect(buildPdfTextCacheKey('a/c.pdf', 100, 200)).not.toEqual(base)
    expect(buildPdfTextCacheKey('a/b.pdf', 101, 200)).not.toEqual(base)
    expect(buildPdfTextCacheKey('a/b.pdf', 100, 201)).not.toEqual(base)
  })
})

describe('buildPdfTextCacheKeyFromContent (SHA-256)', () => {
  it('returns a c-prefixed 64-char lowercase hex string', async () => {
    const key = await buildPdfTextCacheKeyFromContent('hello')
    // c: + 32 bytes hex = 2 + 64 chars
    expect(key).toMatch(/^c:[0-9a-f]{64}$/)
  })

  it('is deterministic for the same input', async () => {
    const a = await buildPdfTextCacheKeyFromContent('JVBERi0xLjQK')
    const b = await buildPdfTextCacheKeyFromContent('JVBERi0xLjQK')
    expect(a).toBe(b)
  })

  it('differs across inputs', async () => {
    const a = await buildPdfTextCacheKeyFromContent('AAAA')
    const b = await buildPdfTextCacheKeyFromContent('AAAB')
    expect(a).not.toBe(b)
  })

  it('matches a known SHA-256 vector for "abc"', async () => {
    // Reference: SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    const key = await buildPdfTextCacheKeyFromContent('abc')
    expect(key).toBe(
      'c:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('keeps path-key and content-key namespaces disjoint', async () => {
    const pathKey = buildPdfTextCacheKey('any/path.pdf', 0, 0)
    const contentKey = await buildPdfTextCacheKeyFromContent('any')
    expect(pathKey.startsWith('c:')).toBe(false)
    expect(contentKey.startsWith('c:')).toBe(true)
  })
})
