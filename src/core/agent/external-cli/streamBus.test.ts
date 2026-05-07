// streamBus.test.ts - External CLI stream bus unit tests

import { ExternalCliStreamBus } from './streamBus'

describe('ExternalCliStreamBus', () => {
  it('snapshot exceeding SNAPSHOT_MAX_CHARS is truncated from the front', () => {
    const bus = new ExternalCliStreamBus()

    // Push a 5MB chunk (single push)
    const fiveMB = 'x'.repeat(5 * 1024 * 1024)
    bus.push({ type: 'stdout', toolCallId: 'tc-snap', chunk: fiveMB, ts: 0 })

    const snap = bus.getSnapshot('tc-snap')
    expect(snap).not.toBeNull()
    // snapshot length should be <= SNAPSHOT_MAX_CHARS + marker length + 1024 tolerance
    const SNAPSHOT_MAX_CHARS = 1 * 1024 * 1024
    const MARKER = '... [front truncated] ...\n'
    expect(snap!.stdout.length).toBeLessThanOrEqual(
      SNAPSHOT_MAX_CHARS + MARKER.length + 1024,
    )
    // Content should contain the truncation marker
    expect(snap!.stdout).toContain('[front truncated]')
  })

  it('snapshot within limit has complete content', () => {
    const bus = new ExternalCliStreamBus()

    bus.push({ type: 'stdout', toolCallId: 'tc-small', chunk: 'hello', ts: 0 })
    bus.push({ type: 'stdout', toolCallId: 'tc-small', chunk: ' world', ts: 1 })

    const snap = bus.getSnapshot('tc-small')
    expect(snap?.stdout).toBe('hello world')
  })

  it('stderr is also protected by capping', () => {
    const bus = new ExternalCliStreamBus()

    const fiveMB = 'e'.repeat(5 * 1024 * 1024)
    bus.push({ type: 'stderr', toolCallId: 'tc-err', chunk: fiveMB, ts: 0 })

    const snap = bus.getSnapshot('tc-err')
    const SNAPSHOT_MAX_CHARS = 1 * 1024 * 1024
    const MARKER = '... [front truncated] ...\n'
    expect(snap!.stderr.length).toBeLessThanOrEqual(
      SNAPSHOT_MAX_CHARS + MARKER.length + 1024,
    )
  })
})
