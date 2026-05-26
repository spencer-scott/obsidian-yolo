import type {
  JsSandboxSettings,
  YoloSettings,
} from '../../settings/schema/setting.types'

import {
  JS_SANDBOX_FETCH_DEFAULT_MAX_CONCURRENT,
  JS_SANDBOX_FETCH_DEFAULT_MAX_RESPONSE_KB,
  JS_SANDBOX_FETCH_HARD_MAX_CONCURRENT,
  JS_SANDBOX_VAULT_READ_DEFAULT_MAX_KB,
  resolveJsSandboxOutputMaxBytes,
} from './jsSandboxTool'

export const JS_SANDBOX_BASE_DESCRIPTION =
  'Execute JavaScript in an isolated classic Worker and return JSON. Each call uses a fresh Worker; re-import/recreate state inside the same call. Single expressions are auto-returned; multi-statement code needs an explicit return. No DOM/document/Image; use Worker APIs (Blob, Response, Request, OffscreenCanvas, createImageBitmap, etc.).' +
  ' Errors: every await can reject — do NOT convert failed awaits to null via `.catch(() => null)` or empty catch blocks. Let exceptions propagate so the host returns `{ error, stack }`.' +
  ' Injected variables: $now (Date object), $isoDate ("YYYY-MM-DD" string), $note ({path:string,basename:string,frontmatter:Record}|null — null in Quick Ask or when no note is open), $content (string|null — full text of the active note), $selection (string|null — user\'s current text selection), $vault ({name:string, adapter:{basePath:string|null}}), $links (string[] — outgoing wiki-link targets from current note), $tags (string[] — tags from current note).' +
  ' $utils helpers — json: flatten(v), groupBy(items,key), countBy(items,key); text: markdownHeadings(md)->[{level,text,line}], tasks(md)->[{checked,status,text,indent,line}], wikilinks(md)->[{target,alias}]; stats: sum/mean/median/percentile(vals,p)/stdev(vals,sample?); matrix: identity(n)/multiply(a,b)/pow(m,exp); date: addDays(isoDate,days), diffDays(a,b), today().'

export type { JsSandboxSettings } from '../../settings/schema/setting.types'

/**
 * Single source of truth for the global JS sandbox configuration. Every
 * consumer (LLM-facing description, capability gate, proxy handler, approval
 * mode resolver) reads through this helper so the model's view of `js_eval`
 * cannot drift from what the host actually executes.
 */
export function getJsSandboxSettings(
  settings: Pick<YoloSettings, 'jsSandbox'> | null | undefined,
): JsSandboxSettings {
  return settings?.jsSandbox ?? {}
}

/**
 * Whether any extension capability (network / vault read / $db / external
 * scripts) is enabled. When true the host forces `require_approval` for
 * every agent that has `js_eval` enabled.
 */
export function hasAnyJsSandboxCapEnabled(s: JsSandboxSettings): boolean {
  return Boolean(
    s.allowFetch ||
      s.allowVaultRead ||
      s.allowDbQuery ||
      s.allowExternalScripts,
  )
}

/**
 * Build the LLM-facing description. The base section only describes what's
 * always available; every conditional API (vault read, network, $db,
 * external scripts) — including its existence, signature, caps, and
 * error semantics — is added only when its capability is enabled. When
 * everything is off (the default), the model has no reason to try APIs
 * that don't exist, so the description stays minimal.
 */
export function buildJsSandboxToolDescription(s: JsSandboxSettings): string {
  const enabled: string[] = []

  if (s.allowVaultRead) {
    const vaultCapKb =
      typeof s.vaultReadMaxKb === 'number' && s.vaultReadMaxKb > 0
        ? s.vaultReadMaxKb
        : JS_SANDBOX_VAULT_READ_DEFAULT_MAX_KB
    enabled.push(
      `await $vault.readText(path) -> string|null (path is vault-relative, NOT absolute under $vault.adapter.basePath; null only if the file is missing; folder paths and read failures throw; text above ${vaultCapKb} KB is truncated); await $vault.readBinary(path) -> {base64,mimeType,byteLength}|null (same path/null/throw semantics; files above ${vaultCapKb} KB are refused; for Blob: \`new Blob([Uint8Array.from(atob(base64), c=>c.charCodeAt(0))], {type:mimeType})\`)`,
    )
  }

  if (s.allowFetch || s.allowExternalScripts) {
    const fetchCapKb =
      typeof s.fetchMaxResponseKb === 'number' && s.fetchMaxResponseKb > 0
        ? s.fetchMaxResponseKb
        : JS_SANDBOX_FETCH_DEFAULT_MAX_RESPONSE_KB
    const fetchMaxConcurrent =
      typeof s.fetchMaxConcurrent === 'number' &&
      Number.isFinite(s.fetchMaxConcurrent) &&
      s.fetchMaxConcurrent > 0
        ? Math.min(
            JS_SANDBOX_FETCH_HARD_MAX_CONCURRENT,
            Math.floor(s.fetchMaxConcurrent),
          )
        : JS_SANDBOX_FETCH_DEFAULT_MAX_CONCURRENT
    enabled.push(
      `Network: fetch/XMLHttpRequest/WebSocket are browser-native and still obey CORS/CSP. For cross-origin reads use await $fetch(url,{method?,headers?,body?,contentType?}) -> Response; it uses Obsidian host networking, buffers the response, is capped at ${fetchCapKb} KB, and allows at most ${fetchMaxConcurrent} concurrent $fetch calls per execution (excess calls throw)`,
    )
  }

  if (s.allowDbQuery) {
    const dbLimit =
      typeof s.dbQueryMaxLimit === 'number' &&
      Number.isFinite(s.dbQueryMaxLimit) &&
      s.dbQueryMaxLimit > 0
        ? Math.min(100, Math.floor(s.dbQueryMaxLimit))
        : 20
    const binaryHint = s.allowVaultRead
      ? 'Do not use $db for images/PDF/audio/binary; use $vault.readBinary(path) for those.'
      : 'Do not use $db for images/PDF/audio/binary — those are out of scope.'
    enabled.push(
      `Text only, markdown-focused. await $db.search(query, limit?) -> [{path,content,similarity,...}] (RAG semantic/vector search; \`content\` is the matched chunk excerpt, not the full file; up to ${dbLimit} results; throws when the vault has no index). await $db.find(keyword, limit?) -> [{path,excerpt}] (best-effort case-insensitive keyword scan over markdown files only; scans up to 500 files, skips files larger than 256 KB; returns [] for empty keyword, no match, or read failures — does not throw). await $db.get(path) -> {content,frontmatter}|null (null if the path is missing, points to a folder, or the read fails — null does NOT necessarily mean missing). ${binaryHint}`,
    )
  }

  if (s.allowExternalScripts) {
    enabled.push(
      'External scripts: `importScripts(url, ...)` loads AND executes remote classic scripts into the worker — synchronous (no await), registers globals (e.g. `Tesseract`, `tf`). `$loadScript(url)` only FETCHES source text; use it for inspection or patching, NOT to load libraries. Worker/SharedWorker unblocked. Network implicitly enabled',
    )
  }

  const enabledLine =
    enabled.length > 0 ? ` Capabilities enabled: ${enabled.join('; ')}.` : ''

  // When both $vault and $db are on, the model needs picker logic — otherwise
  // it tends to default to $db (lossy excerpts) even for tasks that demand
  // exact bytes (path-keyed reads, line-aligned diffs, missing-file checks,
  // exhaustive scans over a known date/path set).
  const vaultVsDbLine =
    s.allowVaultRead && s.allowDbQuery
      ? ' $vault vs $db: use $vault.readText(path) for exact bytes at known paths (raw text, missing-file checks, exhaustive scans); use $db.find/$db.search to discover files by keyword/similarity. Compose: $db locates, $vault reads.'
      : ''

  const outputCapBytes = resolveJsSandboxOutputMaxBytes(s.outputMaxKb)
  const outputCapKb = Math.floor(outputCapBytes / 1024)
  const returnLine = ` Output is JSON and truncated above ~${outputCapKb} KB; return aggregates + small samples, not raw collected data.`

  return `${JS_SANDBOX_BASE_DESCRIPTION}${enabledLine}${vaultVsDbLine}${returnLine}`
}
