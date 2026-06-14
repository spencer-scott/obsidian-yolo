import type { ChatUserMessage } from '../../types/chat'
import type { ContentPart } from '../../types/llm/request'

/**
 * Time-context injection: at the moment a new user turn enters the conversation,
 * pin the current time onto the message's `timeContext` field; at request-build
 * time a pure function prepends it to the content sent to the LLM.
 *
 * Unlike the system-prompt time variable, this value is frozen once written
 * and never rewritten, so it does not break the prefix cache.
 */

const pad2 = (value: number): string => value.toString().padStart(2, '0')

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/**
 * Format a moment as `2026-05-30 14:53 (Friday)` — date + time + weekday in local time, no timezone.
 */
export const formatTimeContext = (now: Date): string => {
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const weekday = WEEKDAY_NAMES[now.getDay()] ?? WEEKDAY_NAMES[0]
  return `${date} ${time} (${weekday})`
}

/**
 * Write the current time onto `message.timeContext` per settings, returning a
 * new object (never mutates the input). Returns the message unchanged when
 * time-awareness is disabled.
 *
 * Only call this when a new user turn enters the conversation (normal send,
 * Quick Ask message creation, enqueue, or post-history-edit resubmit). Never
 * call from retry / continue / tool recovery / history-patch paths: reuse the
 * existing `timeContext` on the message to keep the prefix cache stable.
 */
export const stampUserMessageTimeContext = (
  message: ChatUserMessage,
  timeContextEnabled: boolean,
): ChatUserMessage => {
  if (!timeContextEnabled) {
    return message
  }
  return {
    ...message,
    timeContext: formatTimeContext(new Date()),
  }
}

/**
 * Pure function: prepend `<current_time>…</current_time>` to the content sent
 * to the LLM. Never mutates the input:
 *   - string:        returns a fresh concatenated string.
 *   - ContentPart[]: returns a new array with a text part prepended at
 *     position 0 (existing parts are left untouched), so we don't duplicate
 *     the prefix, pollute snapshotEntries, or corrupt in-memory messages.
 */
export const prefixTimeContext = (
  content: string | ContentPart[],
  timeContext: string,
): string | ContentPart[] => {
  const prefix = `<current_time>${timeContext}</current_time>`
  if (typeof content === 'string') {
    return `${prefix}\n\n${content}`
  }
  return [
    {
      type: 'text',
      text: `${prefix}\n\n`,
    },
    ...content,
  ]
}
