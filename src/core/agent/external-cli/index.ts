// External CLI public entry point
// Platform.isDesktop guard + lazy-loaded runner (keeps mobile safe)
import { Platform } from 'obsidian'

import type {
  AsyncPlaceholderResult,
  RunExternalAgentParams,
  RunExternalAgentResult,
} from './runner'

export type {
  AsyncPlaceholderResult,
  ExternalAgentProvider,
  RunExternalAgentParams,
  RunExternalAgentResult,
} from './runner'
export { externalCliStreamBus } from './streamBus'
export type {
  ExternalCliEvent,
  ExternalCliSnapshot,
  ExternalCliStatus,
} from './streamBus'

/**
 * Run an external CLI Agent on the local machine.
 * Only available on desktop; throws an error when called on mobile.
 */
export async function runExternalAgent(
  params: RunExternalAgentParams,
): Promise<RunExternalAgentResult | AsyncPlaceholderResult> {
  if (!Platform.isDesktop) {
    throw new Error('External agent delegation is only available on desktop.')
  }
  // Lazy-load to avoid node:child_process etc. being evaluated in mobile/web environments
  const { runExternalAgent: _run } = await import('./runner')
  return _run(params)
}

/**
 * Called on plugin unload to terminate all active child processes.
 * Only executes on desktop; no-op on mobile.
 */
export async function killAllActiveExternalCli(): Promise<void> {
  if (!Platform.isDesktop) return
  const { killAllActiveExternalCli: _kill } = await import('./runner')
  _kill()
}
