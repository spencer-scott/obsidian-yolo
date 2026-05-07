// runner.test.ts - External CLI runner unit tests
// Uses Jest to mock node:child_process and related dependencies
/* eslint-disable import/no-nodejs-modules -- test files may directly import node built-in modules for mocking */

import { EventEmitter } from 'node:events'

// ── Mock shell-env ──
jest.mock('shell-env', () => ({
  shellEnvSync: () => ({
    PATH: '/usr/local/bin:/usr/bin:/bin',
    SHELL: '/bin/bash',
  }),
}))

// ── Mock which.ts (always finds the CLI) ──
jest.mock('./which', () => ({
  which: jest.fn().mockResolvedValue('/usr/local/bin/codex'),
}))

// ── Mock streamBus ──
const pushMock = jest.fn()
jest.mock('./streamBus', () => ({
  externalCliStreamBus: {
    push: pushMock,
    getSnapshot: jest.fn().mockReturnValue(null),
    clearSnapshot: jest.fn(),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}))

// ── Mock async-task-registry ──
const registerMock = jest.fn()
const updateMock = jest.fn()
const getMock = jest.fn()
jest.mock('./async-task-registry', () => ({
  asyncTaskRegistry: {
    register: registerMock,
    update: updateMock,
    get: getMock,
    abort: jest.fn(),
    abortAll: jest.fn(),
    listByConversation: jest.fn().mockReturnValue([]),
    abortAllForConversation: jest.fn(),
  },
}))

// ── Mock child_process ──
let mockChild: MockChild
const allMockChildren: MockChild[] = []
const taskkillCalls: Array<{ args: readonly string[] }> = []

class MockChild extends EventEmitter {
  stdin: EventEmitter & { write: jest.Mock; end: jest.Mock }
  stdout: EventEmitter
  stderr: EventEmitter
  pid: number
  kill: jest.Mock

  constructor() {
    super()
    this.pid = 12345
    this.stdin = Object.assign(new EventEmitter(), {
      write: jest.fn(),
      end: jest.fn(),
    })
    this.stdout = new EventEmitter()
    this.stderr = new EventEmitter()
    this.kill = jest.fn()
  }
}

// Mock return value for taskkill: only needs EventEmitter interface (listens for error event)
function makeTaskkillMock(): EventEmitter {
  return new EventEmitter()
}

// Main child process spawn: taskkill returns a standalone EE, others return MockChild
function defaultSpawnImpl(
  command: string,
  args?: readonly string[],
  _options?: unknown,
): unknown {
  if (command === 'taskkill') {
    taskkillCalls.push({ args: args ?? [] })
    return makeTaskkillMock()
  }
  mockChild = new MockChild()
  allMockChildren.push(mockChild)
  return mockChild
}

const spawnMock = jest.fn(defaultSpawnImpl)
const crossSpawnMock = jest.fn(defaultSpawnImpl)

jest.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

jest.mock('cross-spawn', () => ({
  spawn: crossSpawnMock,
}))

// Mock node:fs/promises
// - access/constants: used by which (which itself is mocked, but kept for compatibility)
// - stat: used by runner to validate workingDirectory, defaults to isDirectory=true
jest.mock('node:fs/promises', () => ({
  access: jest.fn().mockResolvedValue(undefined),
  constants: { X_OK: 1 },
  stat: jest.fn().mockResolvedValue({ isDirectory: () => true }),
}))

// Mock node:path
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory requires require syntax
jest.mock('node:path', () => require('path'))

import type { RunExternalAgentResult } from './runner'
import { killAllActiveExternalCli, runExternalAgent } from './runner'

// Prevent real process.kill calls (process tree kill needs negative PID, not available in tests)
const originalKill = process.kill.bind(process)
beforeAll(() => {
  jest.spyOn(process, 'kill').mockImplementation(() => true)
})
afterAll(() => {
  process.kill = originalKill
})

beforeEach(() => {
  jest.clearAllMocks()
  allMockChildren.length = 0
  taskkillCalls.length = 0
  // clearAllMocks clears mockImplementation, so we need to re-set it before each test
  spawnMock.mockImplementation(defaultSpawnImpl)
  crossSpawnMock.mockImplementation(defaultSpawnImpl)
  // which mock also needs to be re-set (clearAllMocks clears mockResolvedValue)
  jest.requireMock('./which').which.mockResolvedValue('/usr/local/bin/codex')
  // Reset active process set (by calling killAll)
  killAllActiveExternalCli()
})

// ── Helper: simulate a successful process exit ──
function simulateSuccess(stdout: string, exitCode = 0) {
  setImmediate(() => {
    mockChild.stdout.emit('data', Buffer.from(stdout))
    mockChild.emit('close', exitCode)
  })
}

describe('runExternalAgent', () => {
  it('successful spawn returns stdout', async () => {
    const promise = runExternalAgent({
      toolCallId: 'tc-1',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      prompt: 'hello',
    })
    simulateSuccess('output text')
    const result = (await promise) as RunExternalAgentResult
    expect(result.stdout).toBe('output text')
    expect(result.exitCode).toBe(0)
    expect(result.truncated).toBeUndefined()
  })

  it('non-zero exit code still returns result', async () => {
    const promise = runExternalAgent({
      toolCallId: 'tc-2',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'workspace-write',
      prompt: 'fail',
    })
    setImmediate(() => {
      mockChild.stdout.emit('data', Buffer.from('partial output'))
      mockChild.emit('close', 1)
    })
    const result = (await promise) as RunExternalAgentResult
    expect(result.stdout).toBe('partial output')
    expect(result.exitCode).toBe(1)
  })

  it('abort signal triggers kill and resolves (preserving collected output)', async () => {
    const controller = new AbortController()
    const promise = runExternalAgent({
      toolCallId: 'tc-3',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      prompt: 'test',
      signal: controller.signal,
    })

    setImmediate(() => {
      mockChild.stdout.emit('data', Buffer.from('some output'))
      controller.abort()
      // Simulate process exiting after being killed by SIGTERM
      setImmediate(() => {
        mockChild.emit('close', null)
      })
    })

    const result = (await promise) as RunExternalAgentResult
    expect(result.stdout).toBe('some output')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest spy assertion must reference the original method
    expect(process.kill).toHaveBeenCalledWith(-mockChild.pid, 'SIGTERM')
  })

  it('timeout triggers kill', async () => {
    // Test timeout logic: use AbortSignal to simulate the timeout path (timeout internally also calls killProcess + reject)
    // Avoid jest.useFakeTimers() as it interferes with await import() microtask queue

    const controller = new AbortController()
    const promise = runExternalAgent({
      toolCallId: 'tc-timeout',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      prompt: 'slow',
      timeoutSeconds: 600,
      signal: controller.signal,
    })

    // abort triggers the same killProcess logic as timeout
    setImmediate(() => {
      controller.abort()
      setImmediate(() => {
        mockChild.emit('close', null)
      })
    })

    await promise
    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest spy assertion
    expect(process.kill).toHaveBeenCalledWith(-mockChild.pid, 'SIGTERM')
  }, 10000)

  it('output exceeding 1MB is head+tail truncated with truncated metadata', async () => {
    // Build data exceeding 1MB
    const MB = 1024 * 1024
    const bigData = Buffer.alloc(MB + 100, 'x')

    const promise = runExternalAgent({
      toolCallId: 'tc-5',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      prompt: 'big',
    })

    setImmediate(() => {
      mockChild.stdout.emit('data', bigData)
      mockChild.emit('close', 0)
    })

    const result = (await promise) as RunExternalAgentResult
    expect(result.truncated).toBeDefined()
    expect(result.truncated?.totalBytes).toBe(MB + 100)
    expect(result.truncated?.omittedBytes).toBeGreaterThan(0)
    // Truncated text should contain the truncation marker
    expect(result.stdout).toContain('output too long')
  })

  it('output exceeding 1.5MB has collector memory usage <= 600KB (head+tail cap)', async () => {
    // Build 1.5MB data, verify that internally collected bytes are far less than original data size
    const MB = 1024 * 1024
    const bigData = Buffer.alloc(1.5 * MB, 0x61) // 1.5MB 'a'

    const promise = runExternalAgent({
      toolCallId: 'tc-mem',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      prompt: 'big',
    })

    setImmediate(() => {
      mockChild.stdout.emit('data', bigData)
      mockChild.emit('close', 0)
    })

    const result = (await promise) as RunExternalAgentResult

    // truncated should exist, and totalBytes should equal the actual input
    expect(result.truncated).toBeDefined()
    expect(result.truncated?.totalBytes).toBe(Math.floor(1.5 * MB))
    // omittedBytes should be > 0 (data was actually omitted)
    expect(result.truncated?.omittedBytes).toBeGreaterThan(0)
    // Final text should contain the truncation marker
    expect(result.stdout).toContain('output too long')
    // Final text length should be far less than the original 1.5MB (head 256KB + marker + tail 256KB ~ 512KB+)
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThan(600 * 1024)
  })

  it('Windows platform uses cross-spawn for main child process, options include windowsHide but not detached', async () => {
    const origPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    })
    try {
      const promise = runExternalAgent({
        toolCallId: 'tc-win-spawn',
        provider: 'codex',
        workingDirectory: '/tmp',
        sandboxMode: 'read-only',
        prompt: 'test',
      })
      simulateSuccess('output')
      await promise

      // On Windows, main child process should only be started via cross-spawn; node:child_process.spawn should not be called
      expect(crossSpawnMock).toHaveBeenCalledTimes(1)
      expect(spawnMock).not.toHaveBeenCalled()
      const opts = crossSpawnMock.mock.calls[0][2] as Record<string, unknown>
      expect(opts.windowsHide).toBe(true)
      expect(opts.detached).toBeUndefined()
    } finally {
      Object.defineProperty(process, 'platform', {
        value: origPlatform,
        configurable: true,
      })
    }
  })

  it('Windows platform + abort calls taskkill /T /F /PID instead of process.kill(-pid)', async () => {
    const origPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    })
    try {
      const controller = new AbortController()
      const promise = runExternalAgent({
        toolCallId: 'tc-win-kill',
        provider: 'codex',
        workingDirectory: '/tmp',
        sandboxMode: 'read-only',
        prompt: 'test',
        signal: controller.signal,
      })

      setImmediate(() => {
        mockChild.stdout.emit('data', Buffer.from('partial'))
        controller.abort()
        setImmediate(() => mockChild.emit('close', null))
      })
      await promise

      // Should call taskkill via spawnMock (cross-spawn is not involved in the kill path)
      expect(taskkillCalls).toHaveLength(1)
      expect(taskkillCalls[0].args).toEqual([
        '/T',
        '/F',
        '/PID',
        String(mockChild.pid),
      ])
      // Should not use POSIX process group kill
      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest spy assertion
      expect(process.kill).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process, 'platform', {
        value: origPlatform,
        configurable: true,
      })
    }
  })

  it('Windows platform - killProcess is idempotent: killAll after abort does not spawn a second taskkill', async () => {
    // Actually covers the killed flag in createKillProcess. After abort triggers,
    // the runner clears timeoutId so the timer won't call killProcess again; but
    // killAllActiveExternalCli will still call the same closure's killProcess,
    // and killed=true must block it.
    const origPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    })
    try {
      const controller = new AbortController()
      const promise = runExternalAgent({
        toolCallId: 'tc-win-idemp',
        provider: 'codex',
        workingDirectory: '/tmp',
        sandboxMode: 'read-only',
        prompt: 'test',
        signal: controller.signal,
      })

      // Wait for child process to be registered in activeProcesses
      await new Promise((r) => setImmediate(r))
      controller.abort()
      // Trigger killAll in the same tick - at this point the abort handler has already
      // called killProcess once; killAll is the second call: idempotency ensures
      // taskkill is only spawned once.
      killAllActiveExternalCli()
      setImmediate(() => mockChild.emit('close', null))
      await promise

      expect(taskkillCalls).toHaveLength(1)
    } finally {
      Object.defineProperty(process, 'platform', {
        value: origPlatform,
        configurable: true,
      })
    }
  }, 5000)

  it('Windows platform - taskkill close non-zero falls back to child.kill()', async () => {
    const origPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    })
    // Make the taskkill mock's returned EE immediately emit close(1)
    const taskkillEEs: EventEmitter[] = []
    spawnMock.mockImplementation((command, args) => {
      if (command === 'taskkill') {
        taskkillCalls.push({ args: args ?? [] })
        const ee = makeTaskkillMock()
        taskkillEEs.push(ee)
        // Async emit close(1) to simulate taskkill starting successfully but failing to execute
        setImmediate(() => ee.emit('close', 1))
        return ee as never
      }
      mockChild = new MockChild()
      allMockChildren.push(mockChild)
      return mockChild as never
    })
    try {
      const controller = new AbortController()
      const promise = runExternalAgent({
        toolCallId: 'tc-win-tkfail',
        provider: 'codex',
        workingDirectory: '/tmp',
        sandboxMode: 'read-only',
        prompt: 'test',
        signal: controller.signal,
      })

      await new Promise((r) => setImmediate(r))
      controller.abort()
      // Wait for taskkill close event propagation + fallback
      await new Promise((r) => setImmediate(r))
      await new Promise((r) => setImmediate(r))
      setImmediate(() => mockChild.emit('close', null))
      await promise

      expect(taskkillCalls).toHaveLength(1)
      // close non-zero should trigger child.kill() fallback
      expect(mockChild.kill).toHaveBeenCalled()
    } finally {
      Object.defineProperty(process, 'platform', {
        value: origPlatform,
        configurable: true,
      })
    }
  })

  it('Windows platform - killAllActiveExternalCli also uses taskkill', async () => {
    const origPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    })
    try {
      const promise = runExternalAgent({
        toolCallId: 'tc-win-killall',
        provider: 'codex',
        workingDirectory: '/tmp',
        sandboxMode: 'read-only',
        prompt: 'long',
        timeoutSeconds: 3600,
      })
      // Wait for child process to be registered in activeProcesses
      await new Promise((r) => setImmediate(r))
      killAllActiveExternalCli()
      // Trigger close to let the promise settle
      setImmediate(() => mockChild.emit('close', null))
      await promise

      expect(taskkillCalls).toHaveLength(1)
      expect(taskkillCalls[0].args).toEqual([
        '/T',
        '/F',
        '/PID',
        String(mockChild.pid),
      ])
    } finally {
      Object.defineProperty(process, 'platform', {
        value: origPlatform,
        configurable: true,
      })
    }
  })

  it('invalid sandboxMode rejects', async () => {
    await expect(
      runExternalAgent({
        toolCallId: 'tc-7',
        provider: 'codex',
        workingDirectory: '/tmp',
        sandboxMode: 'invalid-mode',
        prompt: 'test',
      }),
    ).rejects.toThrow('sandboxMode')
  })

  it('model field with invalid characters rejects', async () => {
    await expect(
      runExternalAgent({
        toolCallId: 'tc-8',
        provider: 'codex',
        workingDirectory: '/tmp',
        sandboxMode: 'read-only',
        prompt: 'test',
        model: 'o3; rm -rf /',
      }),
    ).rejects.toThrow('model')
  })

  it('more than 3 concurrent processes rejects', async () => {
    // Start 3 processes that will not exit
    const makeSlowRun = (id: string) =>
      runExternalAgent({
        toolCallId: id,
        provider: 'codex',
        workingDirectory: '/tmp',
        sandboxMode: 'read-only',
        prompt: 'slow',
        timeoutSeconds: 3600,
      })

    const p1 = makeSlowRun('conc-1')
    const p2 = makeSlowRun('conc-2')
    const p3 = makeSlowRun('conc-3')

    // The 4th should immediately reject (active processes are at capacity: 3)
    await expect(makeSlowRun('conc-4')).rejects.toThrow('too many concurrent')

    // Close all created child processes so p1/p2/p3 can complete
    setImmediate(() => {
      for (const child of allMockChildren) {
        child.emit('close', 0)
      }
    })

    await Promise.allSettled([p1, p2, p3])
  })

  it('UTF-8 boundary - truncation does not break multibyte characters', async () => {
    // Create a buffer > 1MB with CJK characters right at the 256KB boundary
    const MB = 1024 * 1024
    const TRUNCATE_HEAD = 256 * 1024
    const head = Buffer.alloc(TRUNCATE_HEAD - 1, 0x41) // 'A' * (256KB - 1)
    const multibyte = Buffer.from('☃☂', 'utf8') // 6 bytes (UTF-8 multibyte, 3 bytes each)
    // tail is long enough to make total size exceed 1MB
    const tail = Buffer.alloc(MB - TRUNCATE_HEAD + 100, 0x42)
    const bigBuf = Buffer.concat([head, multibyte, tail])
    // Confirm total size actually exceeds 1MB
    expect(bigBuf.length).toBeGreaterThan(MB)

    const promise = runExternalAgent({
      toolCallId: 'tc-utf8',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      prompt: 'utf8',
    })

    setImmediate(() => {
      mockChild.stdout.emit('data', bigBuf)
      mockChild.emit('close', 0)
    })

    const result = (await promise) as RunExternalAgentResult
    // Should be truncated (total size > 1MB)
    expect(result.truncated).toBeDefined()
    // Truncated result should be valid UTF-8 (decodes without replacement char issues)
    expect(() =>
      Buffer.from(result.stdout, 'utf8').toString('utf8'),
    ).not.toThrow()
  })

  // ── Output between 512KB and 1MB is fully preserved, no silent data loss ──
  it('800KB output (512KB < x < 1MB) is fully preserved, truncated is undefined', async () => {
    const KB = 1024
    const size = 800 * KB
    const data = Buffer.alloc(size, 0x41) // 800KB 'A'

    const promise = runExternalAgent({
      toolCallId: 'tc-800kb',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      prompt: 'medium',
    })

    setImmediate(() => {
      mockChild.stdout.emit('data', data)
      mockChild.emit('close', 0)
    })

    const result = (await promise) as RunExternalAgentResult
    // 800KB < 1MB, should be fully preserved, no truncation
    expect(result.truncated).toBeUndefined()
    // Output length should equal original size (ASCII characters, bytes == char count)
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBe(size)
  })

  // ── CJK content >1MB does not produce replacement chars after truncation ──
  it('1.2MB output containing CJK characters does not contain replacement chars after truncation', async () => {
    const MB = 1024 * 1024
    // Each CJK character is 3 bytes in UTF-8, 4 chars = 12 bytes, repeated to fill ~1.2MB
    const unit = Buffer.from('☃☂☄★', 'utf8') // 12 bytes (UTF-8 multibyte, 3 bytes each)
    const repeat = Math.ceil((1.2 * MB) / unit.length)
    const chunks: Buffer[] = []
    for (let i = 0; i < repeat; i++) {
      chunks.push(unit)
    }
    const bigBuf = Buffer.concat(chunks)
    expect(bigBuf.length).toBeGreaterThan(MB)

    const promise = runExternalAgent({
      toolCallId: 'tc-chinese-utf8',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      prompt: 'chinese',
    })

    setImmediate(() => {
      mockChild.stdout.emit('data', bigBuf)
      mockChild.emit('close', 0)
    })

    const result = (await promise) as RunExternalAgentResult
    expect(result.truncated).toBeDefined()
    // Should not contain UTF-8 replacement char (U+FFFD)
    expect(result.stdout).not.toContain('�')
  })

  // ── After timeout, result contains timedOut: true and stdout is non-empty ──
  it('timeout sets result.timedOut to true and preserves collected stdout', async () => {
    // Push data first, then start the runner (very small timeoutSeconds) to ensure timeout occurs before close
    // Do not use fake timers to avoid conflicts with await import() microtask queue
    const promise = runExternalAgent({
      toolCallId: 'tc-timeout-result',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      prompt: 'slow',
      timeoutSeconds: 0.05, // timeout after 50ms
    })

    setImmediate(() => {
      // Push data before timeout triggers
      mockChild.stdout.emit(
        'data',
        Buffer.from('partial output before timeout'),
      )
      // Simulate process exit after 200ms (later than the timeout)
      setTimeout(() => {
        mockChild.emit('close', null)
      }, 200)
    })

    const result = (await promise) as RunExternalAgentResult
    expect(result.timedOut).toBe(true)
    expect(result.stdout).toBe('partial output before timeout')
  }, 5000)
})

describe('runExternalAgent — async mode', () => {
  beforeEach(() => {
    registerMock.mockClear()
    updateMock.mockClear()
    getMock.mockClear()
  })

  it('mode=async returns placeholder result immediately without waiting for the process', async () => {
    const abortController = new AbortController()
    getMock.mockReturnValue({
      taskId: 'ext_test001',
      conversationId: 'conv-1',
      provider: 'codex',
      title: 'test task',
      status: 'completed',
      createdAt: Date.now(),
      completedAt: Date.now(),
      stdoutBuffer: 'output text',
      stderrBuffer: '',
      exitCode: 0,
      abortController,
      source: {
        type: 'llm_tool_call',
        toolCallId: 'tc-async',
        assistantMessageId: 'msg-1',
      },
    })

    const promise = runExternalAgent({
      toolCallId: 'tc-async',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      prompt: 'async test task prompt',
      mode: 'async',
      taskId: 'ext_test001',
      conversationId: 'conv-1',
      source: {
        type: 'llm_tool_call',
        toolCallId: 'tc-async',
        assistantMessageId: 'msg-1',
      },
    })

    // mode=async should resolve immediately, no need to wait for close event
    const result = await promise
    expect('accepted' in result).toBe(true)
    if ('accepted' in result) {
      expect(result.accepted).toBe(true)
      expect(result.taskId).toBe('ext_test001')
      expect(result.status).toBe('running')
    }

    // registry.register should have been called
    expect(registerMock).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'ext_test001' }),
    )

    // Simulate process completion (background)
    simulateSuccess('output text')
  })

  it('mode=async emits task-completed event after process completes', async () => {
    const abortController = new AbortController()
    const completedRecord = {
      taskId: 'ext_test002',
      conversationId: 'conv-2',
      provider: 'codex' as const,
      title: 'another task',
      status: 'completed' as const,
      createdAt: Date.now(),
      completedAt: Date.now(),
      stdoutBuffer: 'done output',
      stderrBuffer: '',
      exitCode: 0,
      abortController,
      source: {
        type: 'llm_tool_call' as const,
        toolCallId: 'tc-async2',
        assistantMessageId: 'msg-2',
      },
    }
    getMock.mockReturnValue(completedRecord)

    const promise = runExternalAgent({
      toolCallId: 'tc-async2',
      provider: 'codex',
      workingDirectory: '/tmp',
      sandboxMode: 'read-only',
      prompt: 'task 2',
      mode: 'async',
      taskId: 'ext_test002',
      conversationId: 'conv-2',
      source: {
        type: 'llm_tool_call',
        toolCallId: 'tc-async2',
        assistantMessageId: 'msg-2',
      },
    })
    await promise

    // Simulate process completion
    await new Promise<void>((resolve) => {
      simulateSuccess('done output')
      setImmediate(resolve)
    })

    // registry.update should have been called
    expect(updateMock).toHaveBeenCalledWith(
      'ext_test002',
      expect.objectContaining({ status: 'completed', exitCode: 0 }),
    )

    // streamBus.push should have a task-completed event
    expect(pushMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task-completed',
        taskId: 'ext_test002',
      }),
    )
  })
})
