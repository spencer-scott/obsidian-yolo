// Cross-platform which implementation, handling Windows PATHEXT
//
// About the node module import strategy:
// This module is only statically imported by runner.ts, which itself is
// lazy-loaded by external-cli/index.ts via `await import('./runner')`
// behind a Platform.isDesktop guard. So this file is never evaluated on
// mobile, and top-level static imports of node built-in modules are safe -
// esbuild marks node:* as external, and the cjs output converts them to
// `require()`, correctly resolved by the Electron renderer. In contrast,
// dynamic `await import('node:...')` would be preserved as an ES dynamic
// import in cjs output, causing the browser engine to treat the node:
// prefix as a URL fetch and fail.
/* eslint-disable import/no-nodejs-modules -- desktop-only module, lazy-loaded behind Platform.isDesktop */
import { access, constants } from 'node:fs/promises'
import * as path from 'node:path'
/* eslint-enable import/no-nodejs-modules */

/**
 * Return the first non-empty string among multiple candidates.
 * `??` does not skip '', but Windows env variables may have one variant
 * as an empty string and another with a value when merging/normalizing
 * across tools (e.g., process.env compatibility layer, parent-child
 * environment merging in childProcess).
 */
function firstNonEmpty(
  ...values: Array<string | undefined>
): string | undefined {
  for (const v of values) {
    if (v !== undefined && v !== '') return v
  }
  return undefined
}

/**
 * Find the full path of an executable in PATH.
 * macOS/Linux: searches PATH entries in order.
 * Windows: tries each PATH entry with PATHEXT extensions appended.
 *
 * @returns The absolute path if found, null otherwise
 */
export async function which(
  name: string,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  // Windows env variable names are case-insensitive (PATH may actually be
  // called Path or path), and shell-env on Windows returns process.env
  // directly without normalization. PATHEXT is similarly case-insensitive.
  const envPath = firstNonEmpty(env.PATH, env.Path, env.path) ?? ''
  const pathDirs = envPath.split(path.delimiter).filter(Boolean)

  const isWindows = process.platform === 'win32'
  // On Windows, get the extension list from env variables with a default fallback
  const pathext = isWindows
    ? (
        firstNonEmpty(env.PATHEXT, env.Pathext, env.pathext) ??
        '.COM;.EXE;.BAT;.CMD'
      )
        .split(';')
        .filter(Boolean)
    : ['']

  for (const dir of pathDirs) {
    for (const ext of pathext) {
      const candidate = path.join(dir, name + ext)
      try {
        await access(candidate, constants.X_OK)
        return candidate
      } catch {
        // Continue trying the next one
      }
    }
  }

  return null
}
