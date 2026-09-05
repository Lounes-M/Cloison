import 'server-only'
import { PDFDocument } from 'pdf-lib'
import type { TypeAccepte } from './type-reel'

export const PIXELS_MAX = 12_000_000
export const DIMENSION_MAX = 12_000
export function verifierDimensions(largeur: number, hauteur: number) {
  if (
    !Number.isFinite(largeur) ||
    !Number.isFinite(hauteur) ||
    largeur <= 0 ||
    hauteur <= 0 ||
    largeur > DIMENSION_MAX ||
    hauteur > DIMENSION_MAX ||
    largeur * hauteur > PIXELS_MAX
  )
    throw new Error('Dimensions du document trop importantes')
}

/** Lit les dimensions sans allouer les pixels de l'image. */
export function dimensionsImage(contenu: Buffer, type: TypeAccepte): [number, number] {
  if (type === 'image/png' && contenu.length >= 24 && contenu.toString('ascii', 12, 16) === 'IHDR')
    return [contenu.readUInt32BE(16), contenu.readUInt32BE(20)]
  if (type === 'image/jpeg') {
    let i = 2
    while (i + 4 < contenu.length) {
      if (contenu[i] !== 255) throw new Error('JPEG invalide')
      while (contenu[i] === 255) i++
      const marqueur = contenu[i++]!
      if (marqueur === 0xd9 || marqueur === 0xda) break
      if (marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd7)) continue
      if (i + 2 > contenu.length) break
      const longueur = contenu.readUInt16BE(i)
      if (longueur < 2 || i + longueur > contenu.length) break
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marqueur,
        ) &&
        longueur >= 7
      )
        return [contenu.readUInt16BE(i + 5), contenu.readUInt16BE(i + 3)]
      i += longueur
    }
  }
  throw new Error('Image invalide')
}

export async function verifierDocument(contenu: Buffer, type: TypeAccepte) {
  if (type !== 'application/pdf') {
    verifierDimensions(...dimensionsImage(contenu, type))
    return
  }
  const pdf = await PDFDocument.load(contenu, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
  })
  if (pdf.getPageCount() < 1 || pdf.getPageCount() > 40)
    throw new Error(`Ce document compte ${pdf.getPageCount()} pages, nombre non accepte`)
  let total = 0
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize()
    verifierDimensions((width * 150) / 72, (height * 150) / 72)
    total += width * height * (150 / 72) ** 2
    if (total > 160_000_000) throw new Error('Document trop volumineux a rendre')
  }
}
