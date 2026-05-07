// Strip ANSI escape sequences (color, style, cursor control, etc.)
// The regex covers both ESC[ + params + letter and ESC + single-letter control codes
// eslint-disable-next-line no-control-regex -- must match ESC (0x1B) control character to strip ANSI sequences
const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-9;]*[ -/]*[@-~])/g

export function stripAnsi(str: string): string {
  return str.replace(ANSI_PATTERN, '')
}
