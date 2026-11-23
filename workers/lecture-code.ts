import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { loadImage } from '@napi-rs/canvas'

import { verifierDocument } from './validation-document.ts'
import {
  enContexteDom,
  enToileDom,
  moteurPdf,
  racineDesPolices,
  toileBlanche,
} from './rasterisation.ts'
import type { TypeAccepte } from '../lib/coffre/type-reel.ts'

/**
 * Lecture du code 2D-Doc d'une piece, dans le moteur confine.
 *
 * Le 2D-Doc est un DataMatrix imprime sur les documents administratifs. Ce
 * module ne fait que le LIRE : il rend les octets du code, ou rien. Il ne
 * verifie aucune signature et ne connait aucun certificat ; ce controle se
 * fait hors du moteur, sur une chaine courte et bornee, sans decodeur d'image
 * (`lib/2ddoc/`).
 *
 * Rien d'autre ne sort d'ici : ni page, ni image, ni texte du document.
 */

/**
 * 200 points par pouce.
 *
 * Le code d'un avis d'imposition mesure environ deux centimetres pour une
 * cinquantaine de modules : a 150 ppp un module fait deux pixels, trop peu de
 * marge. A 200, une page A4 reste sous les quatre millions de pixels.
 */
const RESOLUTION = 200
const POINTS_PAR_POUCE = 72

/** Le code figure en premiere page ; trois pages couvrent les envois agrafes. */
const PAGES_LUES = 3

/** Borne large : un 2D-Doc tient dans quelques centaines d'octets. */
export const CODE_MAX = 2048

type Pixels = { data: Uint8ClampedArray; width: number; height: number }

let lecteur: Promise<(image: Pixels) => Promise<Buffer | null>> | null = null

/**
 * Le decodeur, charge depuis le disque.
 *
 * Par defaut la bibliotheque va chercher son binaire WebAssembly sur un CDN.
 * Le moteur n'a pas de reseau, et n'a pas a en avoir : le binaire est lu dans
 * `node_modules`, a cote du module.
 */
async function decodeur() {
  lecteur ??= (async () => {
    const { prepareZXingModule, readBarcodes } = await import('zxing-wasm/reader')
    const binaire = readFileSync(
      createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm'),
    )
    await prepareZXingModule({
      overrides: {
        wasmBinary: binaire.buffer.slice(
          binaire.byteOffset,
          binaire.byteOffset + binaire.byteLength,
        ) as ArrayBuffer,
      },
      fireImmediately: true,
    })
    return async (image: Pixels) => {
      const codes = await readBarcodes(image as unknown as ImageData, {
        formats: ['DataMatrix'],
        tryHarder: true,
        maxNumberOfSymbols: 4,
      })
      for (const code of codes) {
        const octets = Buffer.from(code.bytes)
        // Un DataMatrix quelconque (colis, facture) n'est pas un 2D-Doc.
        if (
          code.isValid &&
          octets.length <= CODE_MAX &&
          octets.subarray(0, 2).toString('latin1') === 'DC'
        )
          return octets
      }
      return null
    }
  })()
  return lecteur
}

async function codeDuPdf(contenu: Buffer, lire: (image: Pixels) => Promise<Buffer | null>) {
  const pdfjs = await moteurPdf()
  const chargement = pdfjs.getDocument({
    data: new Uint8Array(contenu),
    standardFontDataUrl: racineDesPolices(),
    maxImageSize: 12_000_000,
  })
  try {
    const document = await chargement.promise
    for (let numero = 1; numero <= Math.min(document.numPages, PAGES_LUES); numero += 1) {
      const page = await document.getPage(numero)
      const vue = page.getViewport({ scale: RESOLUTION / POINTS_PAR_POUCE })
      const { toile, ctx } = toileBlanche(vue.width, vue.height)
      try {
        await page.render({
          canvas: enToileDom(toile),
          canvasContext: enContexteDom(ctx),
          viewport: vue,
        }).promise
        const code = await lire(ctx.getImageData(0, 0, toile.width, toile.height))
        if (code) return code
      } finally {
        toile.width = 1
        toile.height = 1
        page.cleanup()
      }
    }
    return null
  } finally {
    await chargement.destroy()
  }
}

/** Les octets du premier 2D-Doc trouve, ou `null` si la piece n'en porte pas de lisible. */
export async function lireCode2dDoc(contenu: Buffer, type: TypeAccepte): Promise<Buffer | null> {
  await verifierDocument(contenu, type)
  const lire = await decodeur()
  if (type === 'application/pdf') return codeDuPdf(contenu, lire)
  const image = await loadImage(contenu)
  const { toile, ctx } = toileBlanche(image.width, image.height)
  try {
    ctx.drawImage(image, 0, 0)
    return await lire(ctx.getImageData(0, 0, toile.width, toile.height))
  } finally {
    toile.width = 1
    toile.height = 1
  }
}
