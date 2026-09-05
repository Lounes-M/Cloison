import { expect, test } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { verifierDocument, verifierDimensions } from '@/lib/coffre/validation-document'
test('une fausse entete PDF ne suffit pas', async () => {
  await expect(
    verifierDocument(Buffer.from('%PDF-this-is-not-a-pdf'), 'application/pdf'),
  ).rejects.toThrow()
})
test('les dimensions sont bornees avant allocation', () => {
  for (const [w, h] of [
    [Infinity, 1],
    [-1, 100],
    [100000, 1],
    [4000, 4000],
  ])
    expect(() => verifierDimensions(w!, h!)).toThrow()
  expect(() => verifierDimensions(1240, 1754)).not.toThrow()
})
test('un PDF geant ou trop long est refuse au depot', async () => {
  const pdf = await PDFDocument.create()
  pdf.addPage([10000, 10000])
  await expect(verifierDocument(Buffer.from(await pdf.save()), 'application/pdf')).rejects.toThrow()
  const long = await PDFDocument.create()
  for (let i = 0; i < 41; i++) long.addPage()
  await expect(
    verifierDocument(Buffer.from(await long.save()), 'application/pdf'),
  ).rejects.toThrow()
})

test('une entete PNG avec dimensions valides mais sans pixels est refusee', async () => {
  const faux = Buffer.alloc(33)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(faux)
  faux.writeUInt32BE(13, 8)
  faux.write('IHDR', 12)
  faux.writeUInt32BE(100, 16)
  faux.writeUInt32BE(100, 20)
  await expect(verifierDocument(faux, 'image/png')).rejects.toThrow()
})
