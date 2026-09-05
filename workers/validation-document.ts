import { PDFDocument } from 'pdf-lib'
import { loadImage } from '@napi-rs/canvas'
import type { TypeAccepte } from '../lib/coffre/type-reel.ts'

import { verifierDimensions, dimensionsImage } from './dimensions.ts'

export async function verifierDocument(contenu: Buffer, type: TypeAccepte) {
  if (type !== 'application/pdf') {
    verifierDimensions(...dimensionsImage(contenu, type))
    const image = await loadImage(contenu)
    verifierDimensions(image.width, image.height)
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
