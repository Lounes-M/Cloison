import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { createCanvas } from '@napi-rs/canvas'
import { PDFDocument } from 'pdf-lib'
import { beforeAll, expect, test, vi } from 'vitest'

import { traiterDocument } from '@/lib/coffre/traitement-document'
import { verifierCode2dDoc } from '@/lib/2ddoc/verification'
import type { Autorite } from '@/lib/2ddoc/autorites'
import fixture from './fixtures/2ddoc.json'

/**
 * Le vrai moteur, de bout en bout : un avis fictif portant un 2D-Doc entre,
 * seuls les octets du code sortent, et leur signature se verifie hors moteur.
 */
const code = Buffer.from(fixture.codes.avis, 'base64')
let symbole: { data: Uint8ClampedArray; width: number; height: number }

beforeAll(async () => {
  const { prepareZXingModule, writeBarcode } = await import('zxing-wasm/writer')
  const binaire = readFileSync(
    createRequire(import.meta.url).resolve('zxing-wasm/writer/zxing_writer.wasm'),
  )
  await prepareZXingModule({
    overrides: { wasmBinary: new Uint8Array(binaire).buffer },
    fireImmediately: true,
  })
  const ecrit = await writeBarcode(new Uint8Array(code), {
    format: 'DataMatrix',
    withQuietZones: false,
  })
  expect(ecrit.error).toBe('')
  symbole = ecrit.symbol
})

/** Le symbole dessine en PNG, `module` pixels par module, avec marge blanche. */
function png(module: number, marge = 4) {
  const cote = (symbole.width + 2 * marge) * module
  const toile = createCanvas(cote, (symbole.height + 2 * marge) * module)
  const ctx = toile.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, toile.width, toile.height)
  ctx.fillStyle = '#000000'
  for (let y = 0; y < symbole.height; y++)
    for (let x = 0; x < symbole.width; x++)
      if (symbole.data[y * symbole.width + x] === 0)
        ctx.fillRect((x + marge) * module, (y + marge) * module, module, module)
  return toile.toBuffer('image/png')
}

/** Un avis fictif : le code fait deux centimetres, en haut a droite de la page voulue. */
async function avis(pageDuCode = 1, pages = 1) {
  const document = await PDFDocument.create()
  for (let numero = 1; numero <= pages; numero++) {
    const page = document.addPage([595, 842])
    page.drawText(`Avis d impot fictif, page ${numero}`, { x: 50, y: 780, size: 14 })
    if (numero === pageDuCode)
      page.drawImage(await document.embedPng(png(6, 0)), { x: 500, y: 740, width: 57, height: 57 })
  }
  return Buffer.from(await document.save())
}

const autorites: Record<string, Autorite> = {
  ZZ01: {
    nom: 'Autorite fictive',
    adresse: 'http://zz01.invalid/pki-2ddoc.der',
    parNom: true,
    empreinte: '',
    certificat: fixture.autorites.ZZ01,
  },
}
const telecharger = vi.fn(async () => Buffer.from(fixture.certificats.AV01, 'base64'))

test('le code d un avis PDF sort du moteur a l octet pres, puis se verifie', async () => {
  const lu = await traiterDocument(await avis(), 'application/pdf', '', 'lire_code')
  expect(lu.equals(code)).toBe(true)
  expect(
    await verifierCode2dDoc(lu, { telecharger, autorites, maintenant: new Date('2025-08-15') }),
  ).toMatchObject({ etat: 'authentique', valeurs: { annee: '2024' } })
})

test('le code est trouve en deuxieme page, et sur une image deposee', async () => {
  expect(
    (await traiterDocument(await avis(2, 2), 'application/pdf', '', 'lire_code')).equals(code),
  ).toBe(true)
  expect((await traiterDocument(png(4), 'image/png', '', 'lire_code')).equals(code)).toBe(true)
})

test('une piece sans 2D-Doc rend un code vide, jamais une erreur ni une page', async () => {
  expect(await traiterDocument(await avis(0), 'application/pdf', '', 'lire_code')).toHaveLength(0)
  // Au-dela de la troisieme page, le code n'est pas cherche.
  expect(await traiterDocument(await avis(4, 4), 'application/pdf', '', 'lire_code')).toHaveLength(
    0,
  )
})

test('un document que le moteur refuse reste refuse', async () => {
  await expect(
    traiterDocument(Buffer.from('%PDF-1.7 invalide'), 'application/pdf', '', 'lire_code'),
  ).rejects.toThrow()
})
