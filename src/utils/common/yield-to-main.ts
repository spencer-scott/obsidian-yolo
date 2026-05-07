/**
 * Yield to the main thread to prevent long-running tasks from blocking the UI.
 * Uses setTimeout(0) to hand control back to the event loop.
 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

/**
 * Conditional yield: yields once every N calls.
 * Used to reduce yield frequency in loops, balancing performance and responsiveness.
 */
export function createYieldController(yieldEvery = 10) {
  let counter = 0
  return async function maybeYield(): Promise<void> {
    counter++
    if (counter >= yieldEvery) {
      counter = 0
      await yieldToMain()
    }
  }
}
