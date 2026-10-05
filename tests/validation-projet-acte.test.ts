import { expect, test } from 'vitest'
import { degrees, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { verifierProjetActe } from '@/lib/signature/validation-projet'

async function document(modifier?: (pdf: PDFDocument) => void) {
  const pdf = await PDFDocument.create()
  pdf.addPage([595, 842])
  modifier?.(pdf)
  return Buffer.from(await pdf.save())
}
const position = { page: 1, x: 40, y: 40 }
test('le processus valide un original sans le modifier, aux limites du champ', async () => {
  const pdf = await document()
  const original = Buffer.from(pdf)
  await verifierProjetActe(pdf, { page: 1, x: 510, y: 805 })
  expect(pdf.equals(original)).toBe(true)
})
test('une entete trompeuse ne reserve pas un acte valide', async () => {
  await expect(verifierProjetActe(Buffer.from('%PDF-1.7 faux PDF'), position)).rejects.toThrow()
})
test.each([
  { page: 2, x: 40, y: 40 },
  { page: 0, x: 0, y: 0 },
  { page: 1, x: 511, y: 40 },
  { page: 1, x: 40, y: 806 },
  { page: 1, x: -1, y: 40 },
  { page: 1, x: 0.5, y: 40 },
])('refuse la position hors document %j', async (p) => {
  await expect(verifierProjetActe(await document(), p)).rejects.toThrow()
})
test.each([
  'rotation',
  'recadrage',
  'unite',
  'formulaire',
  'javascript',
  'pieces-jointes',
  'pages',
] as const)('refuse un PDF incompatible : %s', async (cas) => {
  const pdf = await document((d) => {
    const page = d.getPages()[0]!
    if (cas === 'rotation') page.setRotation(degrees(90))
    if (cas === 'recadrage') page.setCropBox(10, 10, 500, 700)
    if (cas === 'unite') page.node.set(PDFName.of('UserUnit'), d.context.obj(2))
    if (cas === 'formulaire') d.getForm().createTextField('nom')
    if (cas === 'javascript')
      d.catalog.set(
        PDFName.of('OpenAction'),
        d.context.obj({ S: 'JavaScript', JS: PDFString.of('void 0') }),
      )
    if (cas === 'pieces-jointes')
      d.catalog.set(PDFName.of('Names'), d.context.obj({ EmbeddedFiles: [] }))
    if (cas === 'pages') for (let i = 1; i <= 40; i++) d.addPage()
  })
  await expect(verifierProjetActe(pdf, position)).rejects.toThrow()
})
