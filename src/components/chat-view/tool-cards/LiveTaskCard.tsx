// Live task tool card: terminal style
// Layout: status bar → Progress (always expanded + auto-scroll to bottom) → Output → metadata chips
//
// Design notes:
// - Progress is rendered with a <pre> container plus per-line <span class>; variant determines line coloring
// - metadata is parsed from progress text; if parsing fails, the whole block is hidden

import cx from 'clsx'
import { Check, Loader2, Square, X } from 'lucide-react'

import { useLanguage } from '../../../contexts/language-context'
import { useLiveTaskStream } from '../../../hooks/useLiveTaskStream'
import { ToolCallResponseStatus } from '../../../types/tool-call.types'
import type { ToolCallResponse } from '../../../types/tool-call.types'

export type LiveTaskArgs = {
  workingDirectory?: string
  title?: string
  command?: string
}

type LiveTaskCardProps = {
  toolCallId: string
  response: ToolCallResponse
  args?: LiveTaskArgs
  initialStdout?: string
  initialStderr?: string
  /** Used to display the abort button while in running state */
  onAbort?: () => void
}

type Truncated = { totalBytes: number; omittedBytes: number }

export function LiveTaskCard({
  toolCallId,
  response,
  initialStdout,
  initialStderr,
  onAbort,
}: LiveTaskCardProps) {
  const { t } = useLanguage()
  const stream = useLiveTaskStream(toolCallId)

  const effectiveStatus =
    stream?.source === 'live'
      ? mapLiveStatusToToolStatus(stream.status, response.status)
      : response.status
  // ── Determine text source ──
  let stderrText: string | undefined
  let stdoutText: string | undefined
  let fallbackText: string | undefined
  if (stream !== null && stream.source === 'live') {
    stderrText = stream.stderr || undefined
    stdoutText = stream.stdout || undefined
    // Edge case: scenarios like spawn failure, where the runner has already pushed starting/running but stdout/stderr are both empty.
    // In that case stream !== null would swallow the response.error display. Fall back to fallbackText to surface the real error.
    if (
      response.status === ToolCallResponseStatus.Error &&
      !stderrText &&
      !stdoutText
    ) {
      fallbackText = response.error
    }
  } else if (stream !== null && stream.source === 'historical') {
    stderrText = stream.stderr || undefined
    if (response.status === ToolCallResponseStatus.Success) {
      const terminalOutput = parseTerminalCommandResponseText(
        response.data.text,
      )
      stderrText = terminalOutput?.stderr || stderrText
      stdoutText = terminalOutput
        ? terminalOutput.stdout || undefined
        : response.data.text || undefined
    } else if (
      response.status === ToolCallResponseStatus.Aborted &&
      response.data
    ) {
      const terminalOutput = parseTerminalCommandResponseText(
        response.data.text,
      )
      stderrText = terminalOutput?.stderr || stderrText
      stdoutText = terminalOutput
        ? terminalOutput.stdout || undefined
        : response.data.text || undefined
    } else if (response.status === ToolCallResponseStatus.Error) {
      // Preserve the error text under Error status, otherwise the progress cache would overwrite the original error message
      fallbackText = response.error
    }
  } else if (response.status === ToolCallResponseStatus.Success) {
    const terminalOutput = parseTerminalCommandResponseText(response.data.text)
    stderrText = initialStderr || terminalOutput?.stderr || undefined
    stdoutText =
      initialStdout ||
      terminalOutput?.stdout ||
      (!terminalOutput ? response.data.text : undefined) ||
      undefined
    if (!stderrText && !stdoutText && !terminalOutput) {
      fallbackText = response.data.text
    }
  } else if (
    response.status === ToolCallResponseStatus.Aborted &&
    response.data
  ) {
    const terminalOutput = parseTerminalCommandResponseText(response.data.text)
    stderrText = initialStderr || terminalOutput?.stderr || undefined
    stdoutText =
      initialStdout ||
      terminalOutput?.stdout ||
      (!terminalOutput ? response.data.text : undefined) ||
      undefined
    if (!stderrText && !stdoutText && !terminalOutput) {
      fallbackText = response.data.text
    }
  } else if (response.status === ToolCallResponseStatus.Error) {
    stderrText = initialStderr || undefined
    stdoutText = initialStdout || undefined
    if (!stderrText && !stdoutText) fallbackText = response.error
  }

  const compactText = [stderrText, stdoutText, fallbackText]
    .filter((text): text is string => Boolean(text))
    .join('\n')

  return (
    <TerminalLiveTaskCard
      text={compactText}
      status={effectiveStatus}
      response={response}
      stream={stream}
      onAbort={onAbort}
      t={t}
    />
  )
}

function parseTerminalCommandResponseText(
  text: string,
): { stdout?: string; stderr?: string } | null {
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    const record = parsed as Record<string, unknown>
    const stdout = typeof record.stdout === 'string' ? record.stdout : undefined
    const stderr = typeof record.stderr === 'string' ? record.stderr : undefined
    if (stdout === undefined && stderr === undefined) return null
    return { stdout, stderr }
  } catch {
    return null
  }
}

function TerminalLiveTaskCard({
  text,
  status,
  response,
  stream,
  onAbort,
  t,
}: {
  text: string
  status: ToolCallResponseStatus
  response: ToolCallResponse
  stream: ReturnType<typeof useLiveTaskStream>
  onAbort?: () => void
  t: (key: string, fallback?: string) => string
}) {
  const isRunning = status === ToolCallResponseStatus.Running

  return (
    <div className="yolo-external-agent-card yolo-external-agent-card--compact">
      <div className="yolo-external-agent-card__compact-console-wrap">
        <div className="yolo-external-agent-card__compact-status">
          {isRunning && onAbort ? (
            <button
              type="button"
              className="yolo-external-agent-card__compact-abort-btn"
              onClick={() => void onAbort()}
              title={t('chat.toolCall.abort', 'Abort')}
            >
              <Square size={12} />
            </button>
          ) : (
            <StatusBadge status={status} t={t} />
          )}
        </div>
        {text ? (
          <ConsoleBlock text={text} tone="output" />
        ) : response.status === ToolCallResponseStatus.Aborted &&
          !response.data &&
          stream === null ? (
          <div className="yolo-external-agent-card__no-output">
            {t(
              'chat.liveTask.abortedBeforeOutput',
              'Aborted before any output was collected.',
            )}
          </div>
        ) : (
          <ConsoleBlock text="" tone="output" />
        )}
      </div>
      <TruncationNotice response={response} t={t} />
    </div>
  )
}

/**
 * Terminal log block. Renders the full height; the outer chat view handles scrolling for overflow.
 */
function ConsoleBlock({
  text,
  tone = 'progress',
}: {
  text: string
  tone?: 'progress' | 'output'
}) {
  const lines = text.split('\n')
  return (
    <pre
      className={cx(
        'yolo-external-agent-card__console',
        tone === 'progress' && 'yolo-external-agent-card__console--progress',
      )}
    >
      {lines.map((line, i) => (
        <span
          key={i}
          className={cx(
            'yolo-external-agent-card__line',
            progressLineClass(line),
          )}
        >
          {line}
        </span>
      ))}
    </pre>
  )
}

function progressLineClass(line: string): string | undefined {
  if (/\b(error|failed|denied|killed|timeout)\b/i.test(line)) {
    return 'yolo-external-agent-card__line--parse-error'
  }
  return undefined
}

function mapLiveStatusToToolStatus(
  status: 'starting' | 'running' | 'done',
  fallback: ToolCallResponseStatus,
): ToolCallResponseStatus {
  if (status === 'starting' || status === 'running') {
    return ToolCallResponseStatus.Running
  }
  if (fallback === ToolCallResponseStatus.Error) return fallback
  if (fallback === ToolCallResponseStatus.Aborted) return fallback
  return ToolCallResponseStatus.Success
}

function TruncationNotice({
  response,
  t,
}: {
  response: ToolCallResponse
  t: (key: string, fallback?: string) => string
}) {
  let truncated: Truncated | undefined

  if (
    response.status === ToolCallResponseStatus.Success &&
    response.data.metadata?.truncated
  ) {
    truncated = response.data.metadata.truncated
  } else if (
    response.status === ToolCallResponseStatus.Aborted &&
    response.data?.metadata?.truncated
  ) {
    truncated = response.data.metadata.truncated
  }

  if (!truncated) return null

  return (
    <div className="yolo-external-agent-card__truncation-notice">
      {t(
        'chat.liveTask.truncated',
        `Output truncated: ${truncated.omittedBytes.toLocaleString()} bytes omitted.`,
      )}
    </div>
  )
}

function StatusBadge({
  status,
  t,
}: {
  status: ToolCallResponseStatus
  t: (key: string, fallback?: string) => string
}) {
  switch (status) {
    case ToolCallResponseStatus.Running:
      return (
        <span
          className={cx(
            'yolo-external-agent-card__badge',
            'yolo-external-agent-card__badge--running',
          )}
        >
          <Loader2 size={12} className="yolo-spinner" />
          <span>{t('chat.liveTask.statusRunning', 'Running')}</span>
        </span>
      )
    case ToolCallResponseStatus.Success:
      return (
        <span
          className={cx(
            'yolo-external-agent-card__badge',
            'yolo-external-agent-card__badge--success',
          )}
        >
          <Check size={12} />
          <span>{t('chat.liveTask.statusDone', 'Done')}</span>
        </span>
      )
    case ToolCallResponseStatus.Aborted:
      return (
        <span
          className={cx(
            'yolo-external-agent-card__badge',
            'yolo-external-agent-card__badge--aborted',
          )}
        >
          <X size={12} />
          <span>{t('chat.liveTask.statusAborted', 'Aborted')}</span>
        </span>
      )
    case ToolCallResponseStatus.Error:
      return (
        <span
          className={cx(
            'yolo-external-agent-card__badge',
            'yolo-external-agent-card__badge--error',
          )}
        >
          <X size={12} />
          <span>{t('chat.liveTask.statusError', 'Error')}</span>
        </span>
      )
    default:
      return null
  }
}
