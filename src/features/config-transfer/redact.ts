/**
 * Sensitive field handling during config import/export.
 *
 * Sensitive field coverage (from locations in the current settings schema that may store credentials):
 * - `apiKey: string`: used by providers and various webSearch providers
 * - `password: string`: webSearch.searxng
 * - `headers: { [k]: string }` all values: mcp http/sse transport
 * - `env: { [k]: string }` all values: mcp stdio transport
 * - `customHeaders: [{ key, value }]` each item's value: provider custom request headers
 *
 * Uses a single walker: export uses replace (random strings), import uses strip (empty strings).
 * Field names not on the allowlist are left untouched to avoid accidentally modifying business data.
 */

type WalkOp = (value: string) => string

const SENSITIVE_STRING_FIELDS = new Set(['apiKey', 'password'])
const SENSITIVE_RECORD_FIELDS = new Set(['headers', 'env'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function transformRecord(
  record: Record<string, unknown>,
  op: WalkOp,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === 'string') {
      out[k] = op(v)
    } else {
      out[k] = v
    }
  }
  return out
}

function transformCustomHeaders(items: unknown[], op: WalkOp): unknown[] {
  return items.map((item) => {
    if (!isPlainObject(item)) return item
    const value = item['value']
    if (typeof value !== 'string') return item
    return { ...item, value: op(value) }
  })
}

/**
 * Recursively scan the configuration tree and apply op to all known sensitive fields.
 * Returns a new object without modifying the input.
 */
export function mapSensitiveValues(data: unknown, op: WalkOp): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => mapSensitiveValues(item, op))
  }
  if (!isPlainObject(data)) return data

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_STRING_FIELDS.has(key) && typeof value === 'string') {
      result[key] = op(value)
      continue
    }
    if (SENSITIVE_RECORD_FIELDS.has(key) && isPlainObject(value)) {
      result[key] = transformRecord(value, op)
      continue
    }
    if (key === 'customHeaders' && Array.isArray(value)) {
      result[key] = transformCustomHeaders(value, op)
      continue
    }
    result[key] = mapSensitiveValues(value, op)
  }
  return result
}

/**
 * Replace all sensitive values with equal-length random strings. Empty strings stay empty.
 * Used only for visual redaction; cryptographic strength is not required.
 */
export function redactSensitive(data: unknown): unknown {
  return mapSensitiveValues(data, (value) =>
    value.length > 0 ? randomString(value.length) : '',
  )
}

/**
 * Clear all sensitive values (set to empty strings).
 * Used on the import side: random strings from redacted export files must never be written as real keys.
 */
export function clearSensitive(data: unknown): unknown {
  return mapSensitiveValues(data, () => '')
}

/**
 * Detect whether any non-empty string sensitive values actually exist in the object tree.
 * Used for dynamically determining in the UI whether a given top-level key instance
 * truly contains credentials, replacing the former static `sensitive: true` category-level
 * flag to avoid false positives for "Ollama without apiKey / MCP without env".
 */
export function hasNonEmptyCredentials(data: unknown): boolean {
  if (Array.isArray(data)) {
    return data.some((item) => hasNonEmptyCredentials(item))
  }
  if (!isPlainObject(data)) return false

  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_STRING_FIELDS.has(key)) {
      if (typeof value === 'string' && value.length > 0) return true
      continue
    }
    if (SENSITIVE_RECORD_FIELDS.has(key) && isPlainObject(value)) {
      for (const inner of Object.values(value)) {
        if (typeof inner === 'string' && inner.length > 0) return true
      }
      continue
    }
    if (key === 'customHeaders' && Array.isArray(value)) {
      for (const item of value) {
        if (!isPlainObject(item)) continue
        const v = item['value']
        if (typeof v === 'string' && v.length > 0) return true
      }
      continue
    }
    if (hasNonEmptyCredentials(value)) return true
  }
  return false
}

function randomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
