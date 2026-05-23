// Mock pdf-lib so tests run without a real PDF engine.
jest.mock('pdf-lib', () => {
  const makePage = () => ({})

  const makePdfDocument = (pageCount: number) => {
    const pages = Array.from({ length: pageCount }, () => makePage())
    return {
      getPageCount: jest.fn(() => pages.length),
      copyPages: jest.fn(
        (
          _src: unknown,
          indices: number[],
        ): Promise<ReturnType<typeof makePage>[]> =>
          Promise.resolve(indices.map((i) => pages[i] ?? makePage())),
      ),
      addPage: jest.fn((page: ReturnType<typeof makePage>) => {
        pages.push(page)
      }),
      save: jest.fn(async () => new Uint8Array([1, 2, 3, 4])),
    }
  }

  // Each PDFDocument.load call returns a document with the page count that the
  // test has injected via `__setPageCount`.
  let nextPageCount = 3

  return {
    PDFDocument: {
      load: jest.fn(async () => makePdfDocument(nextPageCount)),
      create: jest.fn(async () => makePdfDocument(0)),
      __setPageCount: (n: number) => {
        nextPageCount = n
      },
    },
  }
})

import { PDFDocument } from 'pdf-lib'

import { PdfSliceError, slicePdfPages } from './slicePdfPages'

const pdfLib = PDFDocument as unknown as {
  load: jest.Mock
  create: jest.Mock
  __setPageCount: (n: number) => void
}

beforeEach(() => {
  pdfLib.__setPageCount(3)
  jest.clearAllMocks()
  pdfLib.__setPageCount(3)
})

describe('slicePdfPages', () => {
  it('slices the requested range and returns clamped bounds', async () => {
    pdfLib.__setPageCount(5)
    const rawData = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF
    const result = await slicePdfPages(rawData, { startPage: 2, endPage: 4 })
    expect(result.bytes).toBeInstanceOf(Uint8Array)
    expect(result.totalSourcePages).toBe(5)
    expect(result.actualStart).toBe(2)
    expect(result.actualEnd).toBe(4)
  })

  it('defaults endPage to last page when omitted', async () => {
    pdfLib.__setPageCount(7)
    const result = await slicePdfPages(new Uint8Array(4), { startPage: 3 })
    expect(result.actualStart).toBe(3)
    expect(result.actualEnd).toBe(7)
  })

  it('clamps endPage to the source page count', async () => {
    pdfLib.__setPageCount(4)
    const result = await slicePdfPages(new Uint8Array(4), {
      startPage: 2,
      endPage: 99,
    })
    expect(result.actualEnd).toBe(4)
  })

  const expectRejectsWithKind = async (
    promise: Promise<unknown>,
    kind: PdfSliceError['kind'],
  ) => {
    await expect(promise).rejects.toBeInstanceOf(PdfSliceError)
    await expect(promise).rejects.toMatchObject({ kind })
  }

  it('throws too-many-pages when range exceeds 100 pages', async () => {
    pdfLib.__setPageCount(200)
    await expectRejectsWithKind(
      slicePdfPages(new Uint8Array(4), { startPage: 1, endPage: 150 }),
      'too-many-pages',
    )
  })

  it('throws invalid-range when startPage > total pages', async () => {
    pdfLib.__setPageCount(3)
    await expectRejectsWithKind(
      slicePdfPages(new Uint8Array(4), { startPage: 10 }),
      'invalid-range',
    )
  })

  it('throws invalid-range when endPage < startPage', async () => {
    pdfLib.__setPageCount(10)
    await expectRejectsWithKind(
      slicePdfPages(new Uint8Array(4), { startPage: 5, endPage: 2 }),
      'invalid-range',
    )
  })

  it('throws load-failed when PDFDocument.load fails (corrupt/encrypted PDF)', async () => {
    pdfLib.load.mockRejectedValueOnce(new Error('encrypted'))
    await expectRejectsWithKind(
      slicePdfPages(new Uint8Array(4), { startPage: 1 }),
      'load-failed',
    )
  })

  it('throws too-large when output exceeds the byte cap', async () => {
    pdfLib.__setPageCount(1)
    // Make save() return a buffer larger than the 24 MB cap.
    const bigBytes = new Uint8Array(25 * 1024 * 1024)
    const fakeSave = jest.fn().mockResolvedValue(bigBytes)
    pdfLib.create.mockResolvedValueOnce({
      addPage: jest.fn(),
      save: fakeSave,
      copyPages: jest.fn().mockResolvedValue([{}]),
    })
    await expectRejectsWithKind(
      slicePdfPages(new Uint8Array(4), { startPage: 1 }),
      'too-large',
    )
  })
})
