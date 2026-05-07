// Parse NDJSON output from claude -p --output-format stream-json
// Observed schema (2026-05):
//   stream_event: event.type === "content_block_delta" && event.delta.type === "text_delta" -> incremental text
//   assistant: message.content[] contains text / tool_use / thinking
//   user: message.content[] contains tool_result (content is string or {type:'text',text}[])
//   result: top-level result field (not message.result)
//   system: subtype field

export class ClaudeStreamParser {
  private lineBuffer = ''
  private gotAnyDelta = false

  constructor(
    private readonly opts: {
      onProgress: (line: string) => void
      onText: (chunk: string) => void
    },
  ) {}

  feed(chunk: string): void {
    this.lineBuffer += chunk
    const lines = this.lineBuffer.split('\n')
    // The last segment may be an incomplete line; keep it in the buffer
    this.lineBuffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) this.processLine(line)
    }
  }

  finish(): void {
    if (this.lineBuffer.trim()) {
      this.processLine(this.lineBuffer)
      this.lineBuffer = ''
    }
  }

  private processLine(raw: string): void {
    let event: Record<string, unknown>
    try {
      event = JSON.parse(raw) as Record<string, unknown>
    } catch {
      this.opts.onProgress(`[parse error] ${raw.slice(0, 80)}`)
      return
    }

    const type = event.type as string | undefined

    if (type === 'stream_event') {
      const ev = event.event as Record<string, unknown> | undefined
      const delta = ev?.delta as Record<string, unknown> | undefined
      if (delta?.type === 'text_delta') {
        const text = delta.text as string | undefined
        if (text) {
          this.opts.onText(text)
          this.gotAnyDelta = true
        }
        // Do not emit onProgress for text_delta to avoid firing on every token
        return
      }
      // Silently ignore other stream_event subtypes (message_start/content_block_start/stop are too noisy)
      return
    }

    if (type === 'system') {
      const subtype = event.subtype as string | undefined
      if (subtype === 'init') {
        const sessionId = event.session_id as string | undefined
        this.opts.onProgress(
          `[system] init session_id=${sessionId ?? '(unknown)'}`,
        )
      }
      // Silently ignore other system subtypes (status, post_turn_summary)
      return
    }

    if (type === 'assistant') {
      const message = event.message as Record<string, unknown> | undefined
      const content = message?.content as unknown[] | undefined
      if (Array.isArray(content)) {
        for (const item of content) {
          const block = item as Record<string, unknown>
          if (block.type === 'tool_use') {
            const name = block.name as string | undefined
            const input = block.input
            // When input is missing, JSON.stringify(undefined) returns undefined and slice would throw
            const inputStr = JSON.stringify(input ?? null).slice(0, 100)
            this.opts.onProgress(`[tool] ${name ?? '?'}(${inputStr})`)
          } else if (block.type === 'thinking') {
            const text = (block.thinking as string | undefined) ?? ''
            this.opts.onProgress(`[thinking] ${text.slice(0, 200)}`)
          }
          // Ignore text blocks (delta has already accumulated; double-counting would duplicate output)
        }
      }
      return
    }

    if (type === 'user') {
      const message = event.message as Record<string, unknown> | undefined
      const content = message?.content as unknown[] | undefined
      if (Array.isArray(content)) {
        for (const item of content) {
          const block = item as Record<string, unknown>
          if (block.type === 'tool_result') {
            const blockContent = block.content
            let text = ''
            if (typeof blockContent === 'string') {
              text = blockContent
            } else if (Array.isArray(blockContent)) {
              text = (blockContent as Record<string, unknown>[])
                .filter((c) => c.type === 'text')
                .map((c) => c.text as string)
                .join('')
            }
            this.opts.onProgress(`[tool result] ${text.slice(0, 200)}`)
          }
        }
      }
      return
    }

    if (type === 'result') {
      const durationMs = event.duration_ms as number | undefined
      const costUsd = event.total_cost_usd as number | undefined
      const numTurns = event.num_turns as number | undefined
      this.opts.onProgress(
        `[done] duration=${durationMs ?? '?'}ms cost=$${costUsd?.toFixed(4) ?? '?'} turns=${numTurns ?? '?'}`,
      )
      // fallback: use the result field when no deltas were received
      if (!this.gotAnyDelta) {
        const resultText = event.result as string | undefined
        if (resultText) {
          this.opts.onText(resultText)
        }
      }
      return
    }

    if (type === 'rate_limit_event') {
      // Silently ignore
      return
    }

    // Unknown type
    this.opts.onProgress(`[event] ${type ?? '(unknown)'}`)
  }
}
