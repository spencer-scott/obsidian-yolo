/**
 * Agent Skills open standard validation module.
 * Reference specification: https://agentskills.io/specification
 */

import { parseYaml } from 'obsidian'

export type ValidationError = {
  field: string
  message: string
}

// ---------------------------------------------------------------------------
// name field validation
// ---------------------------------------------------------------------------

/**
 * Agent Skills standard name rules:
 * - 1-64 characters
 * - Only lowercase letters (a-z), digits (0-9), and hyphens (-) allowed
 * - Cannot start or end with a hyphen
 * - Cannot contain consecutive hyphens (--)
 */
const SKILL_NAME_CHARS_PATTERN = /^[a-z0-9-]+$/

export function validateSkillName(name: unknown): ValidationError[] {
  const errors: ValidationError[] = []

  if (typeof name !== 'string' || name.trim().length === 0) {
    errors.push({ field: 'name', message: 'missing' })
    return errors
  }

  const trimmed = name.trim()

  if (trimmed.length > 64) {
    errors.push({ field: 'name', message: 'exceeds 64 characters' })
  }

  if (/[A-Z]/.test(trimmed)) {
    errors.push({ field: 'name', message: 'uppercase not allowed' })
  } else if (!SKILL_NAME_CHARS_PATTERN.test(trimmed)) {
    errors.push({
      field: 'name',
      message: 'only lowercase letters, numbers, and hyphens allowed',
    })
  } else if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
    errors.push({
      field: 'name',
      message: 'cannot start or end with hyphen',
    })
  } else if (trimmed.includes('--')) {
    errors.push({
      field: 'name',
      message: 'consecutive hyphens not allowed',
    })
  }

  return errors
}

// ---------------------------------------------------------------------------
// description field validation
// ---------------------------------------------------------------------------

export function validateDescription(description: unknown): ValidationError[] {
  const errors: ValidationError[] = []

  if (typeof description !== 'string' || description.trim().length === 0) {
    errors.push({ field: 'description', message: 'missing' })
    return errors
  }

  if (description.trim().length > 1024) {
    errors.push({
      field: 'description',
      message: 'exceeds 1024 characters',
    })
  }

  return errors
}

// ---------------------------------------------------------------------------
// compatibility field validation (optional)
// ---------------------------------------------------------------------------

export function validateCompatibility(
  compatibility: unknown,
): ValidationError[] {
  if (compatibility === undefined || compatibility === null) return []
  if (typeof compatibility === 'string' && compatibility.trim().length > 500) {
    return [{ field: 'compatibility', message: 'exceeds 500 characters' }]
  }
  return []
}

// ---------------------------------------------------------------------------
// Frontmatter parsing (using Obsidian parseYaml)
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from Markdown content.
 * The closing `---` must be on its own line to avoid false truncation when
 * YAML values contain `---`.
 * Returns null if no valid frontmatter exists (missing delimiter / YAML syntax
 * error / non-object top level).
 */
export function parseFrontmatter(
  content: string,
): Record<string, unknown> | null {
  // Split by lines to locate the closing delimiter, ensuring `---` is on its own line
  const normalized = content.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n') && normalized !== '---') {
    return null
  }
  const lines = normalized.split('\n')
  if (lines[0].trim() !== '---') return null
  const endIdx = lines.findIndex(
    (line, idx) => idx >= 1 && line.trim() === '---',
  )
  if (endIdx === -1) return null
  const yamlText = lines.slice(1, endIdx).join('\n')
  try {
    const parsed: unknown = parseYaml(yamlText)
    if (parsed === null || parsed === undefined) return {}
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Package-level validation
// ---------------------------------------------------------------------------

export type FileEntry = {
  relativePath: string
  content: string
}

/**
 * Perform full validation on a directory-format skill package (Agent Skills
 * standard). When dirName is provided, validates that frontmatter.name matches
 * dirName.
 */
export function validateDirectoryPackage(
  dirName: string,
  files: FileEntry[],
): ValidationError[] {
  const errors: ValidationError[] = []

  // 1. Must contain SKILL.md
  const skillMdEntry = files.find((f) => f.relativePath === 'SKILL.md')
  if (!skillMdEntry) {
    errors.push({ field: 'SKILL.md', message: 'missing' })
    return errors
  }

  // 2. SKILL.md must contain valid frontmatter
  const frontmatter = parseFrontmatter(skillMdEntry.content)
  if (!frontmatter) {
    errors.push({ field: 'frontmatter', message: 'missing or invalid' })
    return errors
  }

  // 3. Validate name field
  const nameErrors = validateSkillName(frontmatter.name)
  errors.push(...nameErrors)

  // 4. name must match the folder name (Agent Skills specification requirement)
  if (
    nameErrors.length === 0 &&
    typeof frontmatter.name === 'string' &&
    frontmatter.name.trim() !== dirName
  ) {
    errors.push({ field: 'name', message: 'must match folder name' })
  }

  // 5. Validate description field
  errors.push(...validateDescription(frontmatter.description))

  // 6. Validate optional fields
  errors.push(...validateCompatibility(frontmatter.compatibility))

  return errors
}

/**
 * Validate a single-file format skill (legacy format).
 * Requires frontmatter with a name field.
 */
export function validateSingleFileSkill(content: string): ValidationError[] {
  const errors: ValidationError[] = []

  const frontmatter = parseFrontmatter(content)
  if (!frontmatter) {
    errors.push({ field: 'frontmatter', message: 'missing or invalid' })
    return errors
  }

  if (
    typeof frontmatter.name !== 'string' ||
    frontmatter.name.trim().length === 0
  ) {
    errors.push({ field: 'name', message: 'missing' })
  }

  return errors
}
