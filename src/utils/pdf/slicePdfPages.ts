import { PDFDocument } from 'pdf-lib'

/**
 * Hard limits aligned with Anthropic's native-PDF constraints (32 MB whole
 * request payload). Inline base64 inflates raw bytes by ~33%, so we cap raw
 * slice output at 24 MB to keep the encoded request comfortably under the API
 * ceiling — matches `PDF_UPLOAD_MAX_BYTES` for parity.
 */
const MAX_SLICE_PAGES = 100
const MAX_SLICE_BYTES = 24 * 1024 * 1024 // 24 MB raw

/**
 * Thrown when a slice cannot be produced. The `kind` field tells the caller
 * how to react:
 *   • 'invalid-range'  — caller-supplied startPage/endPage violates document
 *     bounds. Surface this as a hard error to the model (it asked for a page
 *     that doesn't exist); do NOT silently fall back to text.
 *   • 'load-failed'    — source PDF couldn't be parsed (encrypted, corrupt,
 *     unsupported). Falling back to text extraction is reasonable.
 *   • 'too-many-pages' — requested range is valid but exceeds the per-slice
 *     page cap. Caller can fall back to text.
 *   • 'too-large'      — sliced output exceeds the byte cap. Caller can fall
 *     back to text.
 */
export type PdfSliceErrorKind =
  | 'invalid-range'
  | 'load-failed'
  | 'too-many-pages'
  | 'too-large'

export class PdfSliceError extends Error {
  readonly kind: PdfSliceErrorKind
  constructor(kind: PdfSliceErrorKind, message: string) {
    super(message)
    this.name = 'PdfSliceError'
    this.kind = kind
  }
}

export type SlicePdfPagesRange = {
  /** 1-based inclusive start page. */
  startPage: number
  /** 1-based inclusive end page. Defaults to the last page of the document. */
  endPage?: number
}

export type SlicePdfPagesResult = {
  /** The sliced PDF bytes. Pages are renumbered 1..N internally by pdf-lib. */
  bytes: Uint8Array
  /** Total page count of the original source document. */
  totalSourcePages: number
  /** Clamped 1-based start page actually included in the slice. */
  actualStart: number
  /** Clamped 1-based end page actually included in the slice. */
  actualEnd: number
}

/**
 * Extract a contiguous page range from a PDF document into a new PDF. The
 * source document is loaded exactly once; total page count and clamped range
 * are returned so callers don't need a separate probe.
 *
 * @throws {PdfSliceError} If the source cannot be loaded, the range is invalid,
 *   the page count exceeds {@link MAX_SLICE_PAGES}, or the output exceeds the
 *   byte size cap.
 */
export async function slicePdfPages(
  rawData: Uint8Array,
  range: SlicePdfPagesRange,
): Promise<SlicePdfPagesResult> {
  let source: PDFDocument
  try {
    source = await PDFDocument.load(rawData)
  } catch (err) {
    throw new PdfSliceError(
      'load-failed',
      `Failed to load PDF (may be encrypted, corrupt, or an unsupported format): ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const totalSourcePages = source.getPageCount()

  if (!Number.isInteger(range.startPage) || range.startPage < 1) {
    throw new PdfSliceError(
      'invalid-range',
      `Invalid startPage ${range.startPage}; must be a positive integer.`,
    )
  }
  if (range.startPage > totalSourcePages) {
    throw new PdfSliceError(
      'invalid-range',
      `startPage ${range.startPage} exceeds the source document's ${totalSourcePages} pages.`,
    )
  }

  const actualStart = range.startPage
  const actualEnd =
    range.endPage !== undefined
      ? Math.min(range.endPage, totalSourcePages)
      : totalSourcePages

  if (actualEnd < actualStart) {
    throw new PdfSliceError(
      'invalid-range',
      `endPage ${range.endPage} is less than startPage ${range.startPage}.`,
    )
  }

  const sliceLength = actualEnd - actualStart + 1
  if (sliceLength > MAX_SLICE_PAGES) {
    throw new PdfSliceError(
      'too-many-pages',
      `Requested ${sliceLength} pages but the maximum allowed per slice is ${MAX_SLICE_PAGES}.`,
    )
  }

  const target = await PDFDocument.create()
  // pdf-lib uses 0-based page indices.
  const zeroBasedIndices: number[] = []
  for (let p = actualStart; p <= actualEnd; p += 1) {
    zeroBasedIndices.push(p - 1)
  }
  const copiedPages = await target.copyPages(source, zeroBasedIndices)
  for (const page of copiedPages) {
    target.addPage(page)
  }

  const saved = await target.save()
  const bytes = saved instanceof Uint8Array ? saved : new Uint8Array(saved)

  if (bytes.byteLength > MAX_SLICE_BYTES) {
    throw new PdfSliceError(
      'too-large',
      `PDF slice is ${bytes.byteLength} bytes, which exceeds the ${MAX_SLICE_BYTES}-byte limit.`,
    )
  }

  return { bytes, totalSourcePages, actualStart, actualEnd }
}
