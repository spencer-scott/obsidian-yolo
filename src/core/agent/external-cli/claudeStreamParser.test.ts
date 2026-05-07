import { ClaudeStreamParser } from './claudeStreamParser'

function makeParser() {
  const progress: string[] = []
  const textChunks: string[] = []
  const parser = new ClaudeStreamParser({
    onProgress: (line) => progress.push(line),
    onText: (chunk) => textChunks.push(chunk),
  })
  return { parser, progress, textChunks, text: () => textChunks.join('') }
}

function line(obj: unknown): string {
  return JSON.stringify(obj) + '\n'
}

// ────── Helper event constructors ──────

function systemInit(sessionId = 'sess-1') {
  return line({ type: 'system', subtype: 'init', session_id: sessionId })
}

function textDelta(text: string) {
  return line({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  })
}

function assistantMessage(content: { type: string; [k: string]: unknown }[]) {
  return line({ type: 'assistant', message: { content } })
}

function userMessage(content: { type: string; [k: string]: unknown }[]) {
  return line({ type: 'user', message: { content } })
}

function resultEvent(
  resultText: string,
  opts: { durationMs?: number; costUsd?: number; numTurns?: number } = {},
) {
  return line({
    type: 'result',
    result: resultText,
    duration_ms: opts.durationMs ?? 1000,
    total_cost_usd: opts.costUsd ?? 0.01,
    num_turns: opts.numTurns ?? 1,
  })
}

// ────── Tests ──────

describe('ClaudeStreamParser', () => {
  test('system/init event emits progress with session_id', () => {
    const { parser, progress } = makeParser()
    parser.feed(systemInit('abc-123'))
    expect(progress).toEqual(['[system] init session_id=abc-123'])
  })

  test('single text_delta: onText accumulates, no progress emitted', () => {
    const { parser, progress, textChunks } = makeParser()
    parser.feed(textDelta('hello'))
    expect(textChunks).toEqual(['hello'])
    expect(progress).toHaveLength(0)
  })

  test('multiple text_deltas: joined into complete text', () => {
    const { parser, text } = makeParser()
    parser.feed(textDelta('hello'))
    parser.feed(textDelta(' '))
    parser.feed(textDelta('world'))
    expect(text()).toBe('hello world')
  })

  test('assistant message with tool_use: emits progress, not onText', () => {
    const { parser, progress, textChunks } = makeParser()
    parser.feed(
      assistantMessage([
        { type: 'tool_use', name: 'Read', input: { path: '/foo' } },
      ]),
    )
    expect(textChunks).toHaveLength(0)
    expect(progress).toHaveLength(1)
    expect(progress[0]).toMatch(/^\[tool\] Read\(/)
  })

  test('assistant message with thinking: emits progress, not onText', () => {
    const { parser, progress, textChunks } = makeParser()
    parser.feed(
      assistantMessage([{ type: 'thinking', thinking: 'let me think...' }]),
    )
    expect(textChunks).toHaveLength(0)
    expect(progress[0]).toBe('[thinking] let me think...')
  })

  test('assistant message with text after delta: onText does not double-count', () => {
    const { parser, text } = makeParser()
    parser.feed(textDelta('hi'))
    parser.feed(assistantMessage([{ type: 'text', text: 'hi' }]))
    // Only the delta counts; assistant text block is not added again
    expect(text()).toBe('hi')
  })

  test('user message with tool_result (string content): emits progress', () => {
    const { parser, progress } = makeParser()
    parser.feed(
      userMessage([
        { type: 'tool_result', tool_use_id: 'x', content: 'file content here' },
      ]),
    )
    expect(progress[0]).toBe('[tool result] file content here')
  })

  test('user message with tool_result (array content): emits progress', () => {
    const { parser, progress } = makeParser()
    parser.feed(
      userMessage([
        {
          type: 'tool_result',
          tool_use_id: 'x',
          content: [
            { type: 'text', text: 'part1' },
            { type: 'text', text: 'part2' },
          ],
        },
      ]),
    )
    expect(progress[0]).toBe('[tool result] part1part2')
  })

  test('result event with existing deltas: does not call onText again', () => {
    const { parser, textChunks, progress } = makeParser()
    parser.feed(textDelta('answer'))
    parser.feed(
      resultEvent('answer', { durationMs: 500, costUsd: 0.005, numTurns: 1 }),
    )
    // Only the delta counts; result does not call onText again
    expect(textChunks).toEqual(['answer'])
    // But a [done] progress line is emitted
    expect(progress.some((p) => p.startsWith('[done]'))).toBe(true)
  })

  test('result event with no deltas: calls onText(result.result) as fallback', () => {
    const { parser, text, progress } = makeParser()
    parser.feed(resultEvent('fallback answer'))
    expect(text()).toBe('fallback answer')
    expect(progress.some((p) => p.startsWith('[done]'))).toBe(true)
  })

  test('chunk spanning lines: half line in chunk1, rest in chunk2', () => {
    const { parser, textChunks } = makeParser()
    const full = textDelta('split')
    const mid = Math.floor(full.length / 2)
    parser.feed(full.slice(0, mid))
    expect(textChunks).toHaveLength(0) // haven't received \n yet
    parser.feed(full.slice(mid))
    expect(textChunks).toEqual(['split'])
  })

  test('single chunk containing multiple JSON lines', () => {
    const { parser, text } = makeParser()
    parser.feed(textDelta('foo') + textDelta('bar'))
    expect(text()).toBe('foobar')
  })

  test('no trailing newline + finish() flushes', () => {
    const { parser, textChunks } = makeParser()
    // No trailing \n
    const raw = JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'end' },
      },
    })
    parser.feed(raw)
    expect(textChunks).toHaveLength(0)
    parser.finish()
    expect(textChunks).toEqual(['end'])
  })

  test('bad JSON line does not throw and does not affect subsequent lines', () => {
    const { parser, progress, textChunks } = makeParser()
    parser.feed('not valid json\n')
    parser.feed(textDelta('ok'))
    expect(progress[0]).toMatch(/^\[parse error\]/)
    expect(textChunks).toEqual(['ok'])
  })

  test('tool_use missing input field does not throw', () => {
    const { parser, progress } = makeParser()
    parser.feed(
      line({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Read' }],
        },
      }),
    )
    expect(progress).toEqual(['[tool] Read(null)'])
  })

  // The runner uses StringDecoder for streaming Buffer decode, but the parser
  // itself only accepts strings. This simulates a "chunk boundary splitting a
  // multibyte character" sequence after StringDecoder repair, verifying the
  // parser correctly joins lineBuffer across chunks without losing characters.
  test('multibyte characters spanning chunks (after StringDecoder fix) accumulate correctly', () => {
    const { parser, text } = makeParser()
    const full = textDelta('☃☂☄★')
    // Cut at any position in the JSON content (cannot break ASCII boundaries since StringDecoder guarantees complete characters)
    const cut = Math.floor(full.length / 2)
    parser.feed(full.slice(0, cut))
    parser.feed(full.slice(cut))
    expect(text()).toBe('☃☂☄★')
  })
})
