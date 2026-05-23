import { App, TFile } from 'obsidian'

import { getYoloSnippetsPath } from '../paths/yoloPaths'

export type SnippetEntry = {
  id: string
  trigger: string
  description?: string
  content: string
}

type YoloSettingsLike = {
  yolo?: {
    baseDir?: string
  }
}

/**
 * Split off a leading YAML frontmatter block (`---\n...\n---\n`) if present.
 * Returns the frontmatter prefix (including the trailing `---\n`) and the
 * remaining body. Only the very first block at the top of the file is
 * recognized — anything else is treated as snippet content.
 */
const splitLeadingFrontmatter = (
  content: string,
): { prefix: string; body: string } => {
  if (!content.startsWith('---\n')) {
    return { prefix: '', body: content }
  }
  const closingIndex = content.indexOf('\n---\n', 4)
  if (closingIndex === -1) {
    return { prefix: '', body: content }
  }
  const end = closingIndex + '\n---\n'.length
  return { prefix: content.slice(0, end), body: content.slice(end) }
}

const stripLeadingFrontmatter = (content: string): string =>
  splitLeadingFrontmatter(content).body

const trimSurroundingBlankLines = (value: string): string => {
  return value.replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, '')
}

/**
 * Parse a snippets.md file into SnippetEntry list.
 *
 * Rules:
 * - Only `## ` headings (exactly two `#`) are recognized as snippet triggers.
 * - The trigger text is the heading content after `## `, trimmed.
 * - If the first non-empty line after the heading is a single-line blockquote
 *   (`> ...`), it becomes `description`. Other forms are NOT a description.
 * - Everything from that point until the next `## ` heading (or EOF) is the
 *   body (with surrounding blank lines trimmed). Empty body -> filtered out.
 * - Duplicate triggers: the first wins, later ones are silently skipped.
 * - A leading YAML frontmatter block is ignored.
 */
export function parseSnippets(content: string): SnippetEntry[] {
  const stripped = stripLeadingFrontmatter(content)
  const lines = stripped.split(/\r?\n/)

  type RawBlock = { trigger: string; bodyLines: string[] }
  const blocks: RawBlock[] = []
  let current: RawBlock | null = null

  for (const line of lines) {
    const headingMatch = /^##[ \t]+(.+?)\s*$/.exec(line)
    // Reject `### ...` etc. — only exactly two `#`.
    const isExactlyH2 = headingMatch && !line.startsWith('###')
    if (isExactlyH2) {
      if (current) blocks.push(current)
      current = { trigger: headingMatch[1].trim(), bodyLines: [] }
      continue
    }
    if (current) {
      current.bodyLines.push(line)
    }
  }
  if (current) blocks.push(current)

  const entries: SnippetEntry[] = []
  const seenTriggers = new Set<string>()

  for (const block of blocks) {
    const trigger = block.trigger
    if (!trigger) continue
    if (seenTriggers.has(trigger)) continue

    let bodyLines = block.bodyLines
    let description: string | undefined

    // Description must be on the line IMMEDIATELY following the heading.
    // Any blank line between the heading and a `> ...` line means the
    // blockquote is body content, not a description.
    if (bodyLines.length > 0) {
      const candidate = bodyLines[0]
      const blockquoteMatch = /^>\s?(.*)$/.exec(candidate)
      if (blockquoteMatch) {
        description = blockquoteMatch[1].trim() || undefined
        bodyLines = bodyLines.slice(1)
      }
    }

    const body = trimSurroundingBlankLines(bodyLines.join('\n'))
    if (body.length === 0) continue

    seenTriggers.add(trigger)
    entries.push({
      id: trigger,
      trigger,
      description,
      content: body,
    })
  }

  return entries
}

/**
 * Remove the first snippet block matching `trigger` (heading text exact match)
 * from the raw snippets.md content. The block spans from its `## ` heading line
 * down to (but excluding) the next `## ` heading or EOF.
 *
 * Returns the new content. If no block matches, returns the input unchanged.
 *
 * Implementation rules:
 * - Operate on the raw text. Do NOT parse-and-reserialize.
 * - A leading YAML frontmatter block is skipped during the heading scan and
 *   prepended back verbatim — `## ` lines inside frontmatter are treated as
 *   data, not as snippet boundaries.
 * - Trigger comparison: exact string match (after trimming the heading text),
 *   case-sensitive, no normalization. (Mirrors parseSnippets's behavior.)
 * - Only `## ` (exactly two `#`) headings count as block boundaries.
 * - Duplicate triggers: remove ONLY the first occurrence (mirrors "first wins"
 *   parse semantics).
 * - Content outside the removed block is preserved verbatim. The only edit at
 *   the join point is capping consecutive blank lines straddling the seam at
 *   2 — blanks elsewhere are not touched.
 * - The file ends with exactly one trailing `\n`.
 * - Mixed line endings are not preserved per-line; output uses a single `\n`
 *   (or `\r\n` if the file is uniformly CRLF). This is acceptable because
 *   snippets.md is plugin-managed text — mixed-eol files are vanishingly rare.
 */
export function removeSnippetBlock(content: string, trigger: string): string {
  // Detect line ending style so we can rebuild without normalizing it.
  const usesCrlf = /\r\n/.test(content) && !/[^\r]\n/.test(content)
  const eol = usesCrlf ? '\r\n' : '\n'

  // Frontmatter is data, not snippets. Skip during scan; prepend back as-is.
  const { prefix, body } = splitLeadingFrontmatter(content)
  const lines = body.split(/\r?\n/)

  // Find the first `## ` heading whose trimmed text exactly equals `trigger`.
  let headingIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('###')) continue
    const m = /^##[ \t]+(.+?)\s*$/.exec(line)
    if (!m) continue
    if (m[1].trim() === trigger) {
      headingIdx = i
      break
    }
  }
  if (headingIdx === -1) return content

  // Find the end of the block: the line index of the next `## ` heading, or
  // lines.length if EOF.
  let endIdx = lines.length
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('###')) continue
    const m = /^##[ \t]+(.+?)\s*$/.exec(line)
    if (m) {
      endIdx = i
      break
    }
  }

  const isBlank = (s: string) => s.trim().length === 0

  // Slice before/after preserving them byte-for-byte except at the seam.
  const before = lines.slice(0, headingIdx)
  const after = lines.slice(endIdx)

  let beforeTrailing = 0
  while (
    beforeTrailing < before.length &&
    isBlank(before[before.length - 1 - beforeTrailing])
  ) {
    beforeTrailing++
  }
  let afterLeading = 0
  while (afterLeading < after.length && isBlank(after[afterLeading])) {
    afterLeading++
  }

  const beforeCore = before.slice(0, before.length - beforeTrailing)
  const afterCore = after.slice(afterLeading)

  // Seam blanks: cap at 2 only when both sides have real content. If one side
  // is empty (we removed the first or last block) the seam is at the file edge,
  // where blanks become dangling head/tail padding — drop them.
  const seamBlanks =
    beforeCore.length > 0 && afterCore.length > 0
      ? Math.min(beforeTrailing + afterLeading, 2)
      : 0

  const remaining = [
    ...beforeCore,
    ...Array<string>(seamBlanks).fill(''),
    ...afterCore,
  ]

  // Strip trailing blank lines, ensure single trailing eol.
  while (remaining.length > 0 && isBlank(remaining[remaining.length - 1])) {
    remaining.pop()
  }
  if (remaining.length === 0) {
    return prefix
  }
  return prefix + remaining.join(eol) + eol
}

/**
 * Async load of snippets from the vault's `YOLO/snippets.md`.
 * Returns `[]` when the file does not exist.
 * Parsing errors propagate to the caller.
 */
export async function loadSnippetEntries(
  app: App,
  options?: { settings?: YoloSettingsLike },
): Promise<SnippetEntry[]> {
  const path = getYoloSnippetsPath(options?.settings)
  const file = app.vault.getAbstractFileByPath(path)
  if (!(file instanceof TFile)) {
    return []
  }
  const content = await app.vault.cachedRead(file)
  return parseSnippets(content)
}
