/**
 * JSON deep merge utility
 *
 * Merge rules:
 * - Objects: recursively merge; imported fields overwrite same-named fields; current-only fields are preserved
 * - Arrays: imported arrays directly replace current arrays
 * - Primitives: imported values overwrite current values
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

/**
 * Deep merge two objects.
 * Values in incoming overwrite same-named fields in base.
 * Fields unique to base are preserved.
 */
export function deepMerge(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base }

  for (const key of Object.keys(incoming)) {
    const baseValue = base[key]
    const incomingValue = incoming[key]

    if (isPlainObject(baseValue) && isPlainObject(incomingValue)) {
      // Recursively merge objects
      result[key] = deepMerge(baseValue, incomingValue)
    } else {
      // Arrays and primitives: direct overwrite
      result[key] = incomingValue
    }
  }

  return result
}
