import 'server-only'
import { PDFDocument } from 'pdf-lib'

/** Entree exclusivement issue de notre rasterisation filigranee, jamais du depot brut. */
export async function extrairePagesRasterisees(
  pdf: Buffer,
  total: number | undefined,
  selection: readonly number[],
  signal: AbortSignal,
): Promise<Buffer> {
  signal.throwIfAborted()
  if (
    !Number.isSafeInteger(total) ||
    !total ||
    total < 1 ||
    total > 40 ||
    pdf.length > 20 * 1024 * 1024 ||
    pdf.subarray(0, 5).toString() !== '%PDF-' ||
    !selection.length ||
    selection.length > 40 ||
    selection.some(
      (p, i) => !Number.isInteger(p) || p < 1 || p > total || (i > 0 && p <= selection[i - 1]!),
    )
  )
    throw new Error('Extrait documentaire indisponible')
  const numeros = [...selection]
  const source = await PDFDocument.load(pdf, { updateMetadata: false })
  signal.throwIfAborted()
  if (source.getPageCount() !== total) throw new Error('Extrait documentaire indisponible')
  const extrait = await PDFDocument.create()
  const pages = await extrait.copyPages(
    source,
    numeros.map((n) => n - 1),
  )
  for (const page of pages) extrait.addPage(page)
  const octets = Buffer.from(await extrait.save())
  signal.throwIfAborted()
  if (octets.length > 4 * 1024 * 1024) throw new Error('Extrait documentaire indisponible')
  return octets
}
