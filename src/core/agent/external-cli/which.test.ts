// which.test.ts - Cross-platform PATH/PATHEXT resolution tests
//
// Note: tests run on the host platform (e.g., darwin/linux), so
// `path.delimiter` and `path.join` semantics follow the host platform
// behavior, regardless of our Object.defineProperty override of
// process.platform. Therefore, do not include the host path.delimiter
// (POSIX ':') in constructed paths, otherwise split(env.PATH) will
// incorrectly split them. Placeholder paths without delimiters are used
// below to work around this.
/* eslint-disable import/no-nodejs-modules -- test files may directly import node built-in modules for mocking */

import * as path from 'node:path'

import { which } from './which'

const mockExisting = new Set<string>()

jest.mock('node:fs/promises', () => ({
  access: jest.fn().mockImplementation((p: string) => {
    if (mockExisting.has(p)) return Promise.resolve()
    return Promise.reject(new Error('ENOENT'))
  }),
  constants: { X_OK: 1 },
}))

beforeEach(() => {
  mockExisting.clear()
})

describe('which — POSIX', () => {
  const origPlatform = process.platform
  beforeAll(() => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    })
  })
  afterAll(() => {
    Object.defineProperty(process, 'platform', {
      value: origPlatform,
      configurable: true,
    })
  })

  it('uppercase PATH matches', async () => {
    mockExisting.add(path.join('/usr/local/bin', 'codex'))
    const result = await which('codex', {
      PATH: ['/opt/x', '/usr/local/bin'].join(path.delimiter),
    })
    expect(result).toBe(path.join('/usr/local/bin', 'codex'))
  })

  it('missing PATH returns null', async () => {
    const result = await which('codex', {})
    expect(result).toBeNull()
  })
})

describe('which — Windows', () => {
  const origPlatform = process.platform
  beforeAll(() => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    })
  })
  afterAll(() => {
    Object.defineProperty(process, 'platform', {
      value: origPlatform,
      configurable: true,
    })
  })

  it('lowercase Path also matches (Windows case-insensitive fallback)', async () => {
    // Note: ext uses uppercase .CMD matching the iteration order in which.ts (PATHEXT defaults to all uppercase).
    // The file system on Windows is case-insensitive, but here we mock access, requiring exact string match.
    const dir = '/fake/npm'
    const candidate = path.join(dir, 'claude.CMD')
    mockExisting.add(candidate)
    const result = await which('claude', {
      Path: dir, // lowercase Path instead of PATH
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
    })
    expect(result).toBe(candidate)
  })

  it('all-lowercase path / pathext also matches', async () => {
    const dir = '/fake/npm2'
    const candidate = path.join(dir, 'codex.cmd')
    mockExisting.add(candidate)
    const result = await which('codex', {
      path: dir,
      pathext: '.com;.exe;.bat;.cmd', // lowercase pathext; which does not normalize case, iterates literally
    })
    expect(result).toBe(candidate)
  })

  it('missing PATHEXT uses default extension set .COM;.EXE;.BAT;.CMD', async () => {
    const dir = '/fake/bin'
    const candidate = path.join(dir, 'claude.EXE')
    mockExisting.add(candidate)
    const result = await which('claude', {
      PATH: dir,
    })
    expect(result).toBe(candidate)
  })

  it('no PATH variant at all returns null', async () => {
    const result = await which('codex', { PATHEXT: '.EXE' })
    expect(result).toBeNull()
  })

  it('PATH is empty string but Path has value - skips empty string and uses Path', async () => {
    const dir = '/fake/binx'
    const candidate = path.join(dir, 'codex.CMD')
    mockExisting.add(candidate)
    const result = await which('codex', {
      PATH: '', // empty string should be skipped
      Path: dir,
      PATHEXT: '.CMD',
    })
    expect(result).toBe(candidate)
  })
})
