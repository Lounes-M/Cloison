import { expect, test, vi } from 'vitest'
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { analyserPagesOcr } from '@/lib/ocr/selection'
import { extrairePagesRasterisees } from '@/lib/ocr/extrait'
import { lireResultatOcr } from '@/lib/ocr/lecture-resultat'

const signal = () => new AbortController().signal
const resultat = (pages = [1, 2]) => ({
  pages: pages.map((page) => ({ page, texte: `Texte ${page}` })),
  modele: 'fictif/modele',
  empreinte: 'a'.repeat(64),
  observeLe: new Date().toISOString(),
})

test.each([null, '', '  '])('une selection vide signifie toutes les pages', (s) => {
  expect(analyserPagesOcr(s)).toBeNull()
})
test('normalise les plages sans doublons et conserve l ordre du document', () => {
  expect(analyserPagesOcr('5, 1, 3-5, 1')).toEqual([1, 3, 4, 5])
})
test.each([
  '0',
  '41',
  '3-1',
  '01',
  '1,',
  ',2',
  '1;2',
  '1.5',
  '-1',
  '1--3',
  '1e1',
  '1,'.repeat(100),
  '1-a',
  '1/2',
])('refuse une selection incorrecte %s', (s) => {
  expect(() => analyserPagesOcr(s)).toThrow()
})
async function source() {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Metadonnee a ne pas transmettre')
  for (const largeur of [101, 202, 303])
    pdf.addPage([largeur, 400]).drawText(`Cloison page ${largeur}`)
  return Buffer.from(await pdf.save())
}
test('extrait uniquement les pages choisies avec leur contenu et sans metadonnees source', async () => {
  const pdf = await PDFDocument.load(
    await extrairePagesRasterisees(await source(), 3, [1, 3], signal()),
  )
  expect(pdf.getPages().map((p) => p.getWidth())).toEqual([101, 303])
  expect(pdf.getTitle()).toBeUndefined()
  expect(pdf.getPages().every((p) => p.node.Contents())).toBe(true)
  const contenu = pdf.context
    .enumerateIndirectObjects()
    .map(([, objet]) =>
      objet instanceof PDFRawStream
        ? Buffer.from(decodePDFRawStream(objet).decode()).toString()
        : '',
    )
    .join('\n')
    .toUpperCase()
  expect(contenu).toContain(Buffer.from('Cloison page 101').toString('hex').toUpperCase())
  expect(contenu).not.toContain(Buffer.from('Cloison page 202').toString('hex').toUpperCase())
  expect(contenu).toContain(Buffer.from('Cloison page 303').toString('hex').toUpperCase())
})
test.each([[0], [4], [1, 1], [2, 1], [], [NaN]].map((pages) => ({ pages })))(
  'refuse des pages absentes, dupliquees ou invalides %#',
  async ({ pages }) => {
    await expect(extrairePagesRasterisees(await source(), 3, pages, signal())).rejects.toThrow()
  },
)
test('refuse une cardinalite source fausse et une interruption', async () => {
  await expect(extrairePagesRasterisees(await source(), 2, [1], signal())).rejects.toThrow()
  await expect(
    extrairePagesRasterisees(await source(), 3, [1], AbortSignal.abort()),
  ).rejects.toThrow()
})
test('valide une restitution partielle avec les numeros originaux', async () => {
  const attendu = resultat([2, 4])
  expect(await lireResultatOcr(Response.json(attendu), signal(), [2, 4])).toEqual(attendu)
})
test.each([
  { pages: [{ page: 2, texte: 'Prive' }] },
  {
    pages: [
      { page: 1, texte: 'a' },
      { page: 1, texte: 'b' },
    ],
  },
  { pages: [{ page: 1, texte: 'a'.repeat(24001) }] },
  { modele: '<script>' },
  { empreinte: 'incorrecte' },
  { observeLe: 'hier' },
  { extra: 'PRIVE' },
])('refuse un resultat malforme %#', async (changement) => {
  await expect(
    lireResultatOcr(Response.json({ ...resultat(), ...changement }), signal(), null),
  ).rejects.toThrow()
})
test('refuse les pages d une autre selection, un corps excessif et un JSON invalide', async () => {
  await expect(lireResultatOcr(Response.json(resultat([1, 2])), signal(), [2, 3])).rejects.toThrow()
  await expect(
    lireResultatOcr(new Response(' '.repeat(192 * 1024 + 1)), signal(), null),
  ).rejects.toThrow()
  await expect(lireResultatOcr(new Response(Buffer.from([255])), signal(), null)).rejects.toThrow()
})
test('annule aussi la lecture du corps quand les entetes sont deja arrives', async () => {
  const c = new AbortController(),
    cancel = vi.fn()
  const corps = new ReadableStream({
    pull() {
      c.abort()
    },
    cancel,
  })
  await expect(lireResultatOcr(new Response(corps), c.signal, null)).rejects.toThrow()
  expect(cancel).toHaveBeenCalled()
})
