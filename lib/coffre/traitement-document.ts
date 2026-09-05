import 'server-only'
import { join } from 'node:path'
import { executerProcessus } from './processus-limite'
import type { TypeAccepte } from './type-reel'

export async function traiterDocument(
  contenu: Buffer,
  type: TypeAccepte,
  filigrane: string,
  operation: 'verifier' | 'rasteriser',
) {
  const sortie = await executerProcessus(
    join(process.cwd(), 'workers', 'document.mjs'),
    Buffer.from(
      JSON.stringify({ operation, type, filigrane, contenu: contenu.toString('base64') }),
    ),
  )
  let resultat: Record<string, unknown>
  try {
    const lu: unknown = JSON.parse(sortie.toString('utf8'))
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) throw new Error()
    resultat = lu as Record<string, unknown>
  } catch {
    // JSON.parse peut citer la sortie brute, donc du contenu documentaire,
    // dans son erreur. L'appelant journalise uniquement ce message controle.
    throw new Error('Reponse du moteur documentaire invalide')
  }
  if (resultat.ok !== true) {
    if (
      typeof resultat.pages === 'number' &&
      Number.isSafeInteger(resultat.pages) &&
      resultat.pages > 40
    )
      throw new Error(`Ce document compte ${resultat.pages} pages, au-dela des 40 traitees`)
    throw new Error('Document invalide ou trop volumineux a traiter')
  }
  if (operation === 'verifier') return Buffer.alloc(0)
  if (typeof resultat.pdf !== 'string') throw new Error('Sortie documentaire invalide')
  const pdf = Buffer.from(resultat.pdf, 'base64')
  if (pdf.length > 20 * 1024 * 1024 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-')
    throw new Error('Sortie documentaire invalide')
  return pdf
}
