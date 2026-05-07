// External CLI subprocess runner
//
// This module is lazy-loaded by external-cli/index.ts via
// `await import('./runner')` behind a Platform.isDesktop guard, so it is
// unreachable on mobile. Top-level static imports of node built-in modules
// are safe (esbuild externalizes them to require); do NOT switch to dynamic
// `await import('node:...')` as that would be preserved as an ES dynamic
// import in the cjs output and fail in the Electron renderer:
// "Failed to fetch dynamically imported module: node:xxx"
/* eslint-disable import/no-nodejs-modules -- desktop-only module, lazy-loaded behind Platform.isDesktop */
import { spawn } from 'node:child_process'
import type {
  ChildProcessWithoutNullStreams,
  SpawnOptions,
} from 'node:child_process'
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
/* eslint-enable import/no-nodejs-modules */

// cross-spawn is only used on the Windows branch: npm globally installed
// claude / codex are .cmd wrapper scripts, and Node 17+ rejects direct
// spawn of .cmd/.bat by default due to CVE-2024-27980.
// cross-spawn handles Windows .cmd quoting edge cases (spaces, non-ASCII,
// shell metacharacters) more reliably than `shell: true` and is the de
// facto standard in the Node ecosystem.
import { spawn as crossSpawn } from 'cross-spawn'
import { shellEnvSync } from 'shell-env'

import type { TaskSource } from '../../../types/chat'

import { type AsyncTaskRecord, asyncTaskRegistry } from './async-task-registry'
import { ClaudeStreamParser } from './claudeStreamParser'
import { externalCliStreamBus } from './streamBus'
import { stripAnsi } from './stripAnsi'
import { which } from './which'

// ────────── Constants ──────────
const MAX_OUTPUT_BYTES = 1 * 1024 * 1024 // 1MB
const TRUNCATE_HEAD_BYTES = 256 * 1024 // 256KB
const TRUNCATE_TAIL_BYTES = 256 * 1024 // 256KB
const MAX_CONCURRENT = 3
const SIGKILL_DELAY_MS = 3000

// Allowed sandboxMode values for codex
const CODEX_SANDBOX_MODES = new Set([
  'read-only',
  'workspace-write',
  'danger-full-access',
])

// Allowed sandboxMode values for claude-code
const CLAUDE_SANDBOX_MODES = new Set([
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
])

// Whitelist regex for the model field
const MODEL_PATTERN = /^[A-Za-z0-9._-]+$/

// ────────── Types ──────────
export type ExternalAgentProvider = 'codex' | 'claude-code'

export type RunExternalAgentParams = {
  toolCallId: string
  provider: ExternalAgentProvider
  workingDirectory: string
  sandboxMode: string
  prompt: string
  model?: string
  timeoutSeconds?: number
  signal?: AbortSignal
  /** Execution mode; defaults to sync */
  mode?: 'sync' | 'async'
  /** Required for async mode: unique task ID */
  taskId?: string
  /** Required for async mode: associated conversation ID */
  conversationId?: string
  /** Required for async mode: task source */
  source?: TaskSource
  /** Async mode: short title for UI display (derived from prompt) */
  title?: string
}

export type AsyncPlaceholderResult = {
  accepted: true
  taskId: string
  title: string
  provider: ExternalAgentProvider
  status: 'running'
  note: string
}

export type RunExternalAgentResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  /** stdout head+tail truncation metadata; undefined when not truncated */
  truncated?: {
    totalBytes: number
    omittedBytes: number
  }
  /** stderr head+tail truncation metadata; undefined when not truncated */
  stderrTruncated?: {
    totalBytes: number
    omittedBytes: number
  }
  timedOut?: boolean
}

// ────────── Active process set (for cleanup on plugin unload) ──────────
const activeProcesses = new Set<() => void>()

/** Called on plugin unload to kill all active child processes */
export function killAllActiveExternalCli(): void {
  for (const killFn of activeProcesses) {
    try {
      killFn()
    } catch {
      // Ignore individual failures, continue cleaning up the rest
    }
  }
  activeProcesses.clear()
}

// ────────── UTF-8 safe byte truncation ──────────

/**
 * Trim incomplete UTF-8 multibyte sequences from the end of a Buffer.
 * Scans backward to find the last leading byte, then checks whether its
 * required continuation bytes are present; if not, the entire sequence
 * is removed.
 *
 * Used even when buf.length <= maxBytes to ensure a valid ending (e.g.,
 * when a chunk boundary falls mid-character during collection).
 */
function trimUtf8End(buf: Buffer): Buffer {
  let end = buf.length
  // Skip backward past continuation bytes to find the last leading byte
  let i = end - 1
  while (i >= 0 && (buf[i] & 0xc0) === 0x80) {
    i--
  }
  if (i < 0) return buf.subarray(0, 0)
  // Determine how many continuation bytes the last leading byte requires
  const lead = buf[i]
  let expectedLen = 1
  if ((lead & 0x80) === 0x00) expectedLen = 1
  else if ((lead & 0xe0) === 0xc0) expectedLen = 2
  else if ((lead & 0xf0) === 0xe0) expectedLen = 3
  else if ((lead & 0xf8) === 0xf0) expectedLen = 4
  const actualCont = end - 1 - i // Actual number of continuation bytes after the leading byte
  const neededCont = expectedLen - 1
  if (actualCont < neededCont) {
    // Sequence is incomplete; remove this leading byte and its insufficient continuation bytes
    end = i
  }
  return buf.subarray(0, end)
}

/**
 * Truncate a Buffer to maxBytes, ensuring the cut point falls on a valid
 * UTF-8 character boundary.
 *
 * If the cut point lands on a continuation byte, walk backward to the
 * leading byte of that multibyte sequence, then remove the entire
 * sequence (conservative truncation to ensure a complete character at
 * the end).
 *
 * If buf.length <= maxBytes, calls trimUtf8End to trim any trailing
 * incomplete sequence.
 */
function trimToUtf8Boundary(buf: Buffer, maxBytes: number): Buffer {
  if (buf.length <= maxBytes) {
    return trimUtf8End(buf)
  }
  // The cut point may land on a continuation byte; walk backward to the leading byte
  let cutAt = maxBytes
  while (cutAt > 0 && (buf[cutAt] & 0xc0) === 0x80) {
    cutAt--
  }
  return buf.subarray(0, cutAt)
}

/**
 * Skip past leading continuation bytes to find the first valid UTF-8
 * character start position. Prevents partial multibyte characters at
 * the front of the tail from producing replacement chars in toString.
 */
function trimUtf8Front(buf: Buffer): Buffer {
  let start = 0
  while (start < buf.length && (buf[start] & 0xc0) === 0x80) {
    start++
  }
  return buf.subarray(start)
}

/**
 * Streaming output collector:
 * - When totalBytes <= MAX_OUTPUT_BYTES: keeps all chunks in full; finalize
 *   concatenates them directly.
 * - Once totalBytes exceeds MAX_OUTPUT_BYTES: switches to head+tail mode
 *   with a steady-state memory cap of approx.
 *   TRUNCATE_HEAD_BYTES + TRUNCATE_TAIL_BYTES (512KB).
 *
 * Guarantee: output <= MAX_OUTPUT_BYTES is returned in full with no data
 *            loss; only output > MAX_OUTPUT_BYTES is head+tail truncated
 *            and marked with truncated metadata.
 */
class CappedOutputCollector {
  // Full mode: used when totalBytes <= MAX_OUTPUT_BYTES
  private fullChunks: Buffer[] = []
  // Head+tail mode: used after exceeding MAX_OUTPUT_BYTES
  private headChunks: Buffer[] = []
  private tailChunks: Buffer[] = []
  private tailBytes = 0
  // Whether head+tail mode has been entered
  private capped = false
  totalBytes = 0

  push(chunk: Buffer): void {
    this.totalBytes += chunk.length

    if (!this.capped) {
      if (this.totalBytes <= MAX_OUTPUT_BYTES) {
        // Full mode: append directly
        this.fullChunks.push(chunk)
        return
      }
      // First time exceeding MAX_OUTPUT_BYTES: treat all collected chunks
      // **plus the current chunk** as "everything so far" to split from,
      // otherwise head would be empty when the first large chunk crosses
      // the threshold.
      this.capped = true
      const allSoFar = Buffer.concat([...this.fullChunks, chunk])
      this.fullChunks = []
      // Fill head (up to TRUNCATE_HEAD_BYTES)
      const headPart = allSoFar.subarray(0, TRUNCATE_HEAD_BYTES)
      this.headChunks.push(headPart)
      // Put the remainder into tail, reuse _trimTail to enforce the cap
      if (allSoFar.length > TRUNCATE_HEAD_BYTES) {
        const leftover = allSoFar.subarray(TRUNCATE_HEAD_BYTES)
        this.tailChunks.push(leftover)
        this.tailBytes = leftover.length
        this._trimTail()
      }
      return
    }

    // Head+tail mode: head is full, new chunks go directly to tail
    this.tailChunks.push(chunk)
    this.tailBytes += chunk.length
    this._trimTail()
  }

  private _trimTail(): void {
    // Shift from the front until tailBytes <= TRUNCATE_TAIL_BYTES
    while (this.tailBytes > TRUNCATE_TAIL_BYTES && this.tailChunks.length > 0) {
      const front = this.tailChunks[0]
      if (this.tailBytes - front.length >= TRUNCATE_TAIL_BYTES) {
        // Discard the entire chunk
        this.tailBytes -= front.length
        this.tailChunks.shift()
      } else {
        // Partial discard: keep only the tail portion
        const keep = TRUNCATE_TAIL_BYTES - (this.tailBytes - front.length)
        this.tailChunks[0] = front.subarray(front.length - keep)
        this.tailBytes = TRUNCATE_TAIL_BYTES
        break
      }
    }
  }

  finalize(): {
    text: string
    truncated?: { totalBytes: number; omittedBytes: number }
  } {
    if (!this.capped) {
      // Full mode: concatenate directly, no truncation
      const text = Buffer.concat(this.fullChunks).toString('utf8')
      return { text }
    }

    // Head+tail mode: trim UTF-8 boundaries then concatenate
    const headBuf = trimToUtf8Boundary(
      Buffer.concat(this.headChunks),
      TRUNCATE_HEAD_BYTES,
    )
    const rawTail = Buffer.concat(this.tailChunks)
    // Trim leading continuation bytes from tail to prevent replacement chars after joining
    const tailBuf = trimToUtf8Boundary(
      trimUtf8Front(rawTail),
      TRUNCATE_TAIL_BYTES,
    )

    const omittedBytes = this.totalBytes - headBuf.length - tailBuf.length
    const marker = `\n\n... [output too long, ${omittedBytes} bytes omitted from the middle] ...\n\n`
    const text = headBuf.toString('utf8') + marker + tailBuf.toString('utf8')
    return { text, truncated: { totalBytes: this.totalBytes, omittedBytes } }
  }
}

// Derive a short title from the prompt (collapse whitespace, max 60 chars)
function deriveTitleFromPrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim().slice(0, 60)
}

/**
 * Create a cross-platform process tree kill function.
 *
 * - POSIX: the child process is spawned with `detached: true` making it
 *   the leader of a new process group; sending a signal to the negative
 *   PID covers the entire group (SIGTERM graceful, SIGKILL forced after
 *   3 seconds).
 * - Windows: there is no process group semantics, and .cmd wrappers fork
 *   node.exe. Use `taskkill /T /F` to recursively force-kill the entire
 *   process tree. Windows has no graceful shutdown equivalent, so a
 *   direct force-kill is pragmatic with no two-phase approach.
 *
 * Idempotent: multiple calls (timeout / abort / unload firing
 * simultaneously) will only send one kill.
 *
 * Fallback: on Windows, if taskkill spawn fails (edge case: taskkill not
 * in PATH), falls back to `child.kill()` (runtime equivalent of
 * TerminateProcess), at least triggering the close event.
 */
function createKillProcess(child: ChildProcessWithoutNullStreams): {
  killProcess: () => void
  cancelPendingKill: () => void
} {
  let killed = false
  let killTimer: ReturnType<typeof setTimeout> | null = null

  const cancelPendingKill = () => {
    if (killTimer) {
      clearTimeout(killTimer)
      killTimer = null
    }
  }

  const killProcess = () => {
    if (killed) return
    killed = true
    if (child.pid === undefined) return

    if (process.platform === 'win32') {
      // Windows: taskkill /T recursively kills the process tree, /F forces (no graceful signal semantics)
      const fallbackKill = () => {
        // child.kill() is the Windows runtime equivalent of TerminateProcess
        // and is still effective for the top-level cmd.exe process; orphaned
        // child processes are rare, no further fallback is needed.
        try {
          child.kill()
        } catch {
          // Already exited, ignore
        }
      }
      try {
        const tk = spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], {
          windowsHide: true,
          stdio: 'ignore',
        })
        // 'error' event: taskkill binary not found / failed to start
        tk.once('error', fallbackKill)
        // 'close' event: taskkill started but exited non-zero (e.g., permission
        // denied, PID already exited). In the "already exited" case child.kill()
        // is a no-op and harmless; otherwise it gives one extra kill attempt.
        tk.once('close', (code) => {
          if (code !== 0) fallbackKill()
        })
      } catch {
        fallbackKill()
      }
      return
    }

    // POSIX: SIGTERM the process group, then SIGKILL fallback after 3s
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Process may have already exited, ignore
    }
    killTimer = setTimeout(() => {
      if (child.pid === undefined) return
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // Already exited, ignore
      }
    }, SIGKILL_DELAY_MS)
  }

  return { killProcess, cancelPendingKill }
}

// ────────── Main function ──────────
export async function runExternalAgent(
  params: RunExternalAgentParams,
): Promise<RunExternalAgentResult | AsyncPlaceholderResult> {
  const {
    toolCallId,
    provider,
    workingDirectory,
    sandboxMode,
    prompt,
    model,
    timeoutSeconds,
    signal: externalSignal,
    mode,
    taskId,
    conversationId,
    source,
    title,
  } = params

  // ── Early check for signal.aborted ──
  if (externalSignal?.aborted) {
    throw new Error('Aborted before start')
  }

  // ── Validate sandboxMode enum (before slot reservation to avoid placeholder leak) ──
  const allowedSandboxModes =
    provider === 'codex' ? CODEX_SANDBOX_MODES : CLAUDE_SANDBOX_MODES
  if (!allowedSandboxModes.has(sandboxMode)) {
    throw new Error(
      `sandboxMode "${sandboxMode}" is not valid for provider "${provider}". ` +
        `Allowed: ${[...allowedSandboxModes].join(', ')}`,
    )
  }

  // ── Validate model field (before slot reservation to avoid placeholder leak) ──
  if (model !== undefined && !MODEL_PATTERN.test(model)) {
    throw new Error(
      `model "${model}" contains invalid characters. Only [A-Za-z0-9._-] are allowed.`,
    )
  }

  // ── Validate workingDirectory: must be an absolute path pointing to an existing directory ──
  // Throw before reserving a concurrency slot to avoid leaking the slot;
  // clear error messages prevent confusion with ENOENT from spawn
  // (which would misleadingly blame the CLI binary path when cwd is missing).
  if (!isAbsolute(workingDirectory)) {
    throw new Error(
      `workingDirectory must be an absolute path: ${workingDirectory}`,
    )
  }
  try {
    const stats = await stat(workingDirectory)
    if (!stats.isDirectory()) {
      throw new Error(
        `workingDirectory is not a directory: ${workingDirectory}`,
      )
    }
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith('workingDirectory is not a directory')
    ) {
      throw err
    }
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new Error(`workingDirectory does not exist: ${workingDirectory}`)
    }
    if (code === 'EACCES') {
      throw new Error(
        `workingDirectory is not accessible (permission denied): ${workingDirectory}`,
      )
    }
    throw new Error(
      `Failed to access workingDirectory "${workingDirectory}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }

  // ── Concurrency limit (reserve slot before any await to prevent race conditions) ──
  if (activeProcesses.size >= MAX_CONCURRENT) {
    throw new Error('too many concurrent external agents (max 3)')
  }
  // Reserve a slot immediately before the first await (placeholder), later replaced with the real kill function
  const placeholder: () => void = () => {}
  activeProcesses.add(placeholder)

  // After reserving a slot, all code paths (including await and synchronous
  // throw) must ensure the placeholder is released, otherwise consecutive
  // startup failures will fill up the concurrency slots. A single try block
  // covers everything up to the replacement with killProcess.
  let env: NodeJS.ProcessEnv
  let cliPath: string | null
  try {
    // ── Load shell environment ──
    env = shellEnvSync()

    // ── Find CLI executable ──
    const cliName = provider === 'codex' ? 'codex' : 'claude'
    cliPath = await which(cliName, env)
    if (!cliPath) {
      throw new Error(
        `CLI "${cliName}" not found in PATH. ` +
          `Please ensure it is installed and available. ` +
          `Current PATH: ${env.PATH ?? '(empty)'}`,
      )
    }
  } catch (err) {
    activeProcesses.delete(placeholder)
    throw err
  }

  // ── Build command arguments ──
  const modelArgs: string[] = model ? ['--model', model] : []

  let args: string[]
  if (provider === 'codex') {
    args = [
      'exec',
      '--sandbox',
      sandboxMode,
      '--skip-git-repo-check',
      ...modelArgs,
      '-', // prompt is passed via stdin
    ]
  } else {
    // claude-code: enable stream-json mode for real-time progress
    args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      sandboxMode,
      ...modelArgs,
    ]
  }

  // ── Initialize stream bus state ──
  externalCliStreamBus.push({ type: 'status', toolCallId, status: 'starting' })

  // ── spawn and stdin.write must also release the placeholder, otherwise
  // a synchronous spawn error / pipe error would leak the concurrency slot. ──
  //
  // Platform branches:
  //  - POSIX: detached: true makes the child the leader of a new process
  //    group, enabling process tree kill via `process.kill(-pid)`.
  //  - Windows: use cross-spawn to handle .cmd wrapper scripts and quoting;
  //    detached is not needed (Windows has no process group semantics),
  //    process tree kill is done by taskkill /T; windowsHide prevents
  //    a separate console window from appearing.
  const isWindows = process.platform === 'win32'
  const spawnOptions: SpawnOptions = isWindows
    ? {
        cwd: workingDirectory,
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    : {
        cwd: workingDirectory,
        env,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
  let child: ChildProcessWithoutNullStreams
  try {
    const spawnFn = isWindows ? crossSpawn : spawn
    child = spawnFn(
      cliPath,
      args,
      spawnOptions,
    ) as ChildProcessWithoutNullStreams

    // Write the prompt to stdin, then close immediately to prevent deadlock
    if (child.stdin) {
      // Listen for stdin errors (e.g., EPIPE when the target process exits
      // immediately) to prevent them from bubbling up as unhandled rejections.
      // The child process exit code will faithfully reflect the failure via
      // the close event.
      child.stdin.on('error', () => {
        // Silent: error info is already conveyed via stderr/exitCode; the stdin error itself needs no reporting
      })
      child.stdin.write(prompt, 'utf8')
      child.stdin.end()
    }
  } catch (err) {
    activeProcesses.delete(placeholder)
    throw err
  }

  externalCliStreamBus.push({ type: 'status', toolCallId, status: 'running' })

  // ── Async mode: register in the registry, continue running in the background after resolve ──
  const isAsync = mode === 'async'
  const resolvedTitle = title ?? deriveTitleFromPrompt(prompt)

  let asyncRecord: AsyncTaskRecord | undefined
  let effectiveSignal = externalSignal
  if (isAsync && taskId && conversationId && source) {
    const abortController = new AbortController()
    // If an external signal was provided, chain it to our own abortController
    externalSignal?.addEventListener('abort', () => abortController.abort(), {
      once: true,
    })
    asyncRecord = {
      taskId,
      source,
      conversationId,
      provider,
      title: resolvedTitle,
      status: 'running',
      createdAt: Date.now(),
      stdoutBuffer: '',
      stderrBuffer: '',
      exitCode: null,
      abortController,
    }
    asyncTaskRegistry.register(asyncRecord)
    // Use asyncRecord's abortController.signal as the process abort signal
    effectiveSignal = abortController.signal
  }

  // ── Collect output (byte-level, memory cap approx. 512KB per stream) ──
  const stderrCollector = new CappedOutputCollector()

  if (provider === 'codex') {
    // codex: stdout is used directly as the final result text
    const stdoutCollector = new CappedOutputCollector()

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutCollector.push(chunk)
      externalCliStreamBus.push({
        type: 'stdout',
        toolCallId,
        chunk: stripAnsi(chunk.toString('utf8')),
        ts: Date.now(),
      })
      if (asyncRecord) {
        asyncRecord.stdoutBuffer += stripAnsi(chunk.toString('utf8'))
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrCollector.push(chunk)
      externalCliStreamBus.push({
        type: 'stderr',
        toolCallId,
        chunk: stripAnsi(chunk.toString('utf8')),
        ts: Date.now(),
      })
      if (asyncRecord) {
        asyncRecord.stderrBuffer += stripAnsi(chunk.toString('utf8'))
      }
    })

    // ── Process tree kill function (cross-platform + idempotent) ──
    const { killProcess, cancelPendingKill } = createKillProcess(child)

    // Replace the placeholder with the real kill function
    activeProcesses.delete(placeholder)
    activeProcesses.add(killProcess)

    // ── Background completion handler (emit task-completed after close in async mode) ──
    const handleClose = (code: number | null, timedOut: boolean) => {
      if (!asyncRecord) return
      const { text: stdoutText } = stdoutCollector.finalize()
      const { text: stderrText } = stderrCollector.finalize()
      const completedAt = Date.now()

      let finalStatus: AsyncTaskRecord['status']
      if (asyncRecord.abortController.signal.aborted) {
        // Determine whether this was caused by plugin unload (abortAll) or user-initiated cancel
        finalStatus = 'cancelled'
      } else if (timedOut) {
        finalStatus = 'timed_out'
      } else if (code === 0) {
        finalStatus = 'completed'
      } else {
        finalStatus = 'failed'
      }

      asyncTaskRegistry.update(asyncRecord.taskId, {
        status: finalStatus,
        completedAt,
        stdoutBuffer: stdoutText,
        stderrBuffer: stderrText,
        exitCode: code,
      })

      const updatedRecord = asyncTaskRegistry.get(asyncRecord.taskId)
      if (updatedRecord) {
        externalCliStreamBus.push({
          type: 'task-completed',
          taskId: asyncRecord.taskId,
          conversationId: asyncRecord.conversationId,
          record: updatedRecord,
        })
      }
    }

    // ── Return Promise ──
    const syncPromise = new Promise<RunExternalAgentResult>(
      (resolve, reject) => {
        let timedOut = false
        const timeoutId: ReturnType<typeof setTimeout> | undefined =
          timeoutSeconds !== undefined
            ? setTimeout(() => {
                timedOut = true
                killProcess()
              }, timeoutSeconds * 1000)
            : undefined

        const onAbort = () => {
          killProcess()
          clearTimeout(timeoutId)
        }
        effectiveSignal?.addEventListener('abort', onAbort, { once: true })

        child.on('error', (err) => {
          clearTimeout(timeoutId)
          cancelPendingKill()
          effectiveSignal?.removeEventListener('abort', onAbort)
          activeProcesses.delete(killProcess)
          externalCliStreamBus.push({
            type: 'status',
            toolCallId,
            status: 'done',
          })
          if (asyncRecord) {
            handleClose(null, false)
          }
          reject(err)
        })

        child.on('close', (code) => {
          clearTimeout(timeoutId)
          cancelPendingKill()
          effectiveSignal?.removeEventListener('abort', onAbort)
          activeProcesses.delete(killProcess)
          externalCliStreamBus.push({
            type: 'status',
            toolCallId,
            status: 'done',
          })

          const { text: stdoutText, truncated } = stdoutCollector.finalize()
          const { text: stderrText, truncated: stderrTruncated } =
            stderrCollector.finalize()

          if (asyncRecord) {
            handleClose(code, timedOut)
          }

          resolve({
            stdout: stdoutText,
            stderr: stderrText,
            exitCode: code,
            truncated,
            stderrTruncated,
            ...(timedOut ? { timedOut: true } : {}),
          })
        })
      },
    )

    if (isAsync && asyncRecord) {
      // Run in background, do not await; errors are not thrown (subprocess failures are conveyed via task-completed events)
      syncPromise.catch(() => {})
      return {
        accepted: true,
        taskId: asyncRecord.taskId,
        title: resolvedTitle,
        provider,
        status: 'running',
        note: 'Task started asynchronously. The result will arrive as a follow-up event when the subprocess completes.',
      } satisfies AsyncPlaceholderResult
    }

    return syncPromise
  }

  // ── claude-code branch: stream-json parsing ──
  const finalTextCollector = new CappedOutputCollector()

  const claudeParser = new ClaudeStreamParser({
    onProgress: (line) => {
      const progressChunk = line + '\n'
      stderrCollector.push(Buffer.from(progressChunk, 'utf8'))
      externalCliStreamBus.push({
        type: 'stderr',
        toolCallId,
        chunk: progressChunk,
        ts: Date.now(),
      })
      if (asyncRecord) {
        asyncRecord.stderrBuffer += progressChunk
      }
    },
    onText: (chunk) => {
      finalTextCollector.push(Buffer.from(chunk, 'utf8'))
      externalCliStreamBus.push({
        type: 'stdout',
        toolCallId,
        chunk,
        ts: Date.now(),
      })
      if (asyncRecord) {
        asyncRecord.stdoutBuffer += chunk
      }
    },
  })

  // Use StringDecoder for streaming decode to prevent replacement chars when Buffer splits mid-multibyte character (CJK/emoji).
  const stdoutDecoder = new StringDecoder('utf8')
  let parserFinished = false
  const finishParserOnce = () => {
    if (parserFinished) return
    parserFinished = true
    const tail = stdoutDecoder.end()
    if (tail) claudeParser.feed(tail)
    claudeParser.finish()
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = stdoutDecoder.write(chunk)
    if (text) claudeParser.feed(text)
  })

  child.stdout?.on('end', () => {
    finishParserOnce()
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    stderrCollector.push(chunk)
    externalCliStreamBus.push({
      type: 'stderr',
      toolCallId,
      chunk: stripAnsi(chunk.toString('utf8')),
      ts: Date.now(),
    })
  })

  // ── Process tree kill function (cross-platform + idempotent) ──
  const { killProcess, cancelPendingKill } = createKillProcess(child)

  // Replace the placeholder with the real kill function
  activeProcesses.delete(placeholder)
  activeProcesses.add(killProcess)

  // ── Background completion handler (emit task-completed after close in async mode) ──
  const handleCloseAsync = (code: number | null, timedOut: boolean) => {
    if (!asyncRecord) return
    const { text: stdoutText } = finalTextCollector.finalize()
    const { text: stderrText } = stderrCollector.finalize()
    const completedAt = Date.now()

    let finalStatus: AsyncTaskRecord['status']
    if (asyncRecord.abortController.signal.aborted) {
      finalStatus = 'cancelled'
    } else if (timedOut) {
      finalStatus = 'timed_out'
    } else if (code === 0) {
      finalStatus = 'completed'
    } else {
      finalStatus = 'failed'
    }

    asyncTaskRegistry.update(asyncRecord.taskId, {
      status: finalStatus,
      completedAt,
      stdoutBuffer: stdoutText,
      stderrBuffer: stderrText,
      exitCode: code,
    })

    const updatedRecord = asyncTaskRegistry.get(asyncRecord.taskId)
    if (updatedRecord) {
      externalCliStreamBus.push({
        type: 'task-completed',
        taskId: asyncRecord.taskId,
        conversationId: asyncRecord.conversationId,
        record: updatedRecord,
      })
    }
  }

  // ── Return Promise ──
  const claudeSyncPromise = new Promise<RunExternalAgentResult>(
    (resolve, reject) => {
      // Timeout flag: do not reject inside setTimeout; let the close event
      // resolve normally. Only enable the timer when timeoutSeconds is
      // explicitly provided; otherwise no timeout (long-running delegated
      // tasks may run indefinitely and are cancelled by the user).
      let timedOut = false
      const timeoutId: ReturnType<typeof setTimeout> | undefined =
        timeoutSeconds !== undefined
          ? setTimeout(() => {
              timedOut = true
              killProcess()
            }, timeoutSeconds * 1000)
          : undefined

      // External abort signal
      const onAbort = () => {
        killProcess()
        // resolve (not reject) so the caller can access the output collected so far
        clearTimeout(timeoutId)
      }
      effectiveSignal?.addEventListener('abort', onAbort, { once: true })

      child.on('error', (err) => {
        clearTimeout(timeoutId)
        cancelPendingKill()
        effectiveSignal?.removeEventListener('abort', onAbort)
        activeProcesses.delete(killProcess)
        finishParserOnce()
        externalCliStreamBus.push({
          type: 'status',
          toolCallId,
          status: 'done',
        })
        if (asyncRecord) {
          handleCloseAsync(null, false)
        }
        reject(err)
      })

      child.on('close', (code) => {
        clearTimeout(timeoutId)
        cancelPendingKill()
        effectiveSignal?.removeEventListener('abort', onAbort)
        activeProcesses.delete(killProcess)
        finishParserOnce()
        externalCliStreamBus.push({
          type: 'status',
          toolCallId,
          status: 'done',
        })

        const { text: stdoutText, truncated } = finalTextCollector.finalize()
        const { text: stderrText, truncated: stderrTruncated } =
          stderrCollector.finalize()

        if (asyncRecord) {
          handleCloseAsync(code, timedOut)
        }

        resolve({
          stdout: stdoutText,
          stderr: stderrText,
          exitCode: code,
          truncated,
          stderrTruncated,
          ...(timedOut ? { timedOut: true } : {}),
        })
      })
    },
  )

  if (isAsync && asyncRecord) {
    claudeSyncPromise.catch(() => {})
    return {
      accepted: true,
      taskId: asyncRecord.taskId,
      title: resolvedTitle,
      provider,
      status: 'running',
      note: 'Task started asynchronously. The result will arrive as a follow-up event when the subprocess completes.',
    } satisfies AsyncPlaceholderResult
  }

  return claudeSyncPromise
}
