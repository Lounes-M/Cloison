import { expect, test } from 'vitest'
import { PDFDocument, rgb } from 'pdf-lib'
import { loadImage, createCanvas } from '@napi-rs/canvas'
import { join } from 'node:path'
import { executerProcessus } from '@/lib/coffre/processus-limite'
import { bornerPlacement } from '@/lib/signature/placement'

async function apercu(pdf: Uint8Array, page: number) {
  return JSON.parse(
    (
      await executerProcessus(
        join(process.cwd(), 'workers/apercu-acte.mjs'),
        Buffer.from(JSON.stringify({ contenu: Buffer.from(pdf).toString('base64'), page })),
        { sortieMax: 3 * 1024 * 1024 },
      )
    ).toString(),
  )
}
test('rend uniquement la page choisie sans modifier les octets originaux', async () => {
  const doc = await PDFDocument.create()
  for (const couleur of [rgb(1, 0, 0), rgb(0, 0, 1)]) {
    doc.addPage([200, 300]).drawRectangle({ x: 0, y: 0, width: 200, height: 300, color: couleur })
  }
  const pdf = await doc.save(),
    avant = Buffer.from(pdf)
  const r = await apercu(pdf, 2)
  expect(r.pages).toEqual([
    { largeur: 200, hauteur: 300 },
    { largeur: 200, hauteur: 300 },
  ])
  const image = await loadImage(Buffer.from(r.png, 'base64'))
  expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(1200)
  const toile = createCanvas(image.width, image.height),
    ctx = toile.getContext('2d')
  ctx.drawImage(image, 0, 0)
  expect([...ctx.getImageData(50, 50, 1, 1).data]).toEqual([0, 0, 255, 255])
  expect(Buffer.from(pdf)).toEqual(avant)
})
test('ne rend pas de faux PDF ni de page inexistante', async () => {
  expect(await apercu(Buffer.from('%PDF-1.7 invalide'), 1)).toEqual({})
  const doc = await PDFDocument.create()
  doc.addPage([200, 300])
  expect(await apercu(await doc.save(), 2)).toEqual({})
})
test('borne le champ entier aux quatre bords et refuse les dimensions ambigues', () => {
  expect(bornerPlacement(-10, -20, 200, 300)).toEqual({ x: 0, y: 0 })
  expect(bornerPlacement(200, 300, 200.5, 300.5)).toEqual({ x: 115, y: 263 })
  expect(() => bornerPlacement(NaN, 0, 200, 300)).toThrow()
  expect(() => bornerPlacement(0, 0, 80, 300)).toThrow()
})
