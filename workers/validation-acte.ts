import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } from 'pdf-lib'
import { verifierDimensions } from './dimensions.ts'
import {
  CHAMP_SIGNATURE,
  PAGES_ACTE_MAX,
  type PositionSignature,
} from '../lib/signature/position.ts'

/** Le fichier original reste intact ; seuls structure et placement sont examines. */
export async function verifierActe(contenu: Buffer, position: PositionSignature) {
  if (
    contenu.length < 8 ||
    contenu.length > 4 * 1024 * 1024 ||
    contenu.subarray(0, 5).toString() !== '%PDF-'
  )
    throw new Error('Acte invalide')
  if (
    !position ||
    ![position.page, position.x, position.y].every(Number.isSafeInteger) ||
    position.page < 1 ||
    position.x < 0 ||
    position.y < 0
  )
    throw new Error('Position invalide')
  const pdf = await PDFDocument.load(contenu, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
    updateMetadata: false,
  })
  const pages = pdf.getPages()
  if (!pages.length || pages.length > PAGES_ACTE_MAX || position.page > pages.length)
    throw new Error('Page invalide')
  const interdits = new Set([
    'OpenAction',
    'AA',
    'JS',
    'JavaScript',
    'Launch',
    'EmbeddedFiles',
    'AF',
    'RichMedia',
    'AcroForm',
    'XFA',
  ])
  for (const [, objet] of pdf.context.enumerateIndirectObjects()) {
    verifierObjet(objet, 0)
  }
  function verifierObjet(objet: unknown, profondeur: number) {
    if (profondeur > 30) throw new Error('Structure excessive')
    if (objet instanceof PDFArray) {
      for (const valeur of objet.asArray()) verifierObjet(valeur, profondeur + 1)
    }
    if (objet instanceof PDFStream) verifierObjet(objet.dict, profondeur + 1)
    if (objet instanceof PDFDict) {
      for (const [nom, valeur] of objet.entries()) {
        if (
          interdits.has(nom.decodeText()) ||
          (valeur instanceof PDFName &&
            ['JavaScript', 'Launch', 'RichMedia'].includes(valeur.decodeText()))
        )
          throw new Error('Contenu actif refuse')
        verifierObjet(valeur, profondeur + 1)
      }
    }
  }
  for (const page of pages) {
    const media = page.getMediaBox(),
      zone = page.getCropBox()
    const unite = page.node.get(PDFName.of('UserUnit'))
    // Les reperes atypiques doivent etre normalises par l'editeur du modele.
    if (
      page.getRotation().angle !== 0 ||
      (unite && unite.toString() !== '1') ||
      media.x !== 0 ||
      media.y !== 0 ||
      zone.x !== 0 ||
      zone.y !== 0 ||
      zone.width !== media.width ||
      zone.height !== media.height
    )
      throw new Error('Repere de page non pris en charge')
    verifierDimensions(media.width, media.height)
  }
  const { width, height } = pages[position.page - 1]!.getSize()
  if (position.x + CHAMP_SIGNATURE.largeur > width || position.y + CHAMP_SIGNATURE.hauteur > height)
    throw new Error('Champ hors page')
  return pages.map((page) => ({ largeur: page.getWidth(), hauteur: page.getHeight() }))
}
