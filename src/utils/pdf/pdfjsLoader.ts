/**
 * Centralised pdfjs-dist loader.
 *
 * Why this exists: importing `pdfjs-dist/build/pdf.worker.mjs` has a side
 * effect — it writes `globalThis.pdfjsWorker`, which pdfjs treats as a
 * "fake worker" registration. Obsidian's built-in PDF viewer uses its own
 * (newer) copy of pdfjs and falls back to the same fake-worker path, so it
 * picks up our worker and crashes with a version-mismatch error, breaking
 * any second PDF the user tries to open.
 *
 * The fix: never import the worker module from the main thread. Instead,
 * inline the worker source at build time, expose it as a Blob URL, and set
 * `pdfjs.GlobalWorkerOptions.workerSrc` so pdfjs spawns a real Worker for
 * us. `globalThis.pdfjsWorker` stays untouched and Obsidian's viewer is
 * unaffected by anything we do.
 */
import workerSource from 'virtual:pdfjs-worker-script'

type PdfjsModule = typeof import('pdfjs-dist')

let pdfjsPromise: Promise<PdfjsModule> | null = null
let workerBlobUrl: string | null = null

function ensureWorkerBlobUrl(): string {
  if (workerBlobUrl) return workerBlobUrl
  const blob = new Blob([workerSource], { type: 'text/javascript' })
  workerBlobUrl = URL.createObjectURL(blob)
  return workerBlobUrl
}

/**
 * Lazy-load pdfjs and ensure its worker is configured via a Blob URL.
 * Safe to call concurrently from multiple call sites; the underlying
 * import + configuration runs at most once per plugin lifetime.
 *
 * `pdfjs-dist` is bundled privately inside this plugin's main.js, so
 * `pdfjs.GlobalWorkerOptions` is a module-local static — Obsidian's own
 * viewer has its own separate copy. We are the only writer, which makes
 * it safe (and necessary, post-dispose) to always reassign `workerSrc`
 * to the current Blob URL rather than guarding on truthiness.
 */
export async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = ensureWorkerBlobUrl()
      return pdfjs
    })()
  }
  return pdfjsPromise
}

/**
 * Release the Blob URL backing the pdfjs worker. Call this from the
 * plugin's `onunload`. Outstanding workers already spawned with the URL
 * keep working — `URL.revokeObjectURL` only prevents future fetches.
 *
 * We deliberately do NOT clear `pdfjs.GlobalWorkerOptions.workerSrc`
 * here: doing so would require keeping a reference to the pdfjs module
 * across disposal, and the next `loadPdfjs()` overwrites it anyway.
 */
export function disposePdfjsWorker(): void {
  if (workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl)
    workerBlobUrl = null
  }
  pdfjsPromise = null
}
