import { createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { z } from 'zod'

export const referenceFichierActe = z.object({
  id: z.uuid(),
  acte_id: z.uuid(),
  nature: z.enum(['projet', 'acte', 'preuve']),
  empreinte: z.string().regex(/^[a-f0-9]{64}$/),
  taille: z
    .number()
    .int()
    .min(8)
    .max(20 * 1024 * 1024),
  nonce: z.string().regex(/^\\x[a-f0-9]{24}$/),
  confirme: z.boolean(),
})
export type FichierActe = z.infer<typeof referenceFichierActe>
export const empreintePdf = (pdf: Uint8Array) => createHash('sha256').update(pdf).digest('hex')
function contexte(f: FichierActe) {
  return Buffer.from(
    JSON.stringify(['cloison-acte-v1', f.acte_id, f.id, f.nature, f.empreinte, f.taille]),
  )
}
export function scellerFichierActe(pdf: Buffer, cle: Buffer, reference: FichierActe) {
  const f = referenceFichierActe.parse(reference)
  if (
    cle.length !== 32 ||
    pdf.length !== f.taille ||
    empreintePdf(pdf) !== f.empreinte ||
    pdf.subarray(0, 5).toString() !== '%PDF-'
  )
    throw new Error('Archive invalide')
  // La reservation SQL rend immuables nonce, empreinte, taille et destination.
  // Un contenu different est refuse AVANT toute reutilisation de ce nonce.
  const chiffre = createCipheriv('aes-256-gcm', cle, Buffer.from(f.nonce.slice(2), 'hex'))
  chiffre.setAAD(contexte(f))
  return Buffer.concat([chiffre.update(pdf), chiffre.final(), chiffre.getAuthTag()])
}
export function ouvrirFichierActe(octets: Buffer, cle: Buffer, reference: FichierActe) {
  const f = referenceFichierActe.parse(reference)
  if (cle.length !== 32 || octets.length !== f.taille + 16) throw new Error('Archive invalide')
  const dechiffre = createDecipheriv('aes-256-gcm', cle, Buffer.from(f.nonce.slice(2), 'hex'))
  dechiffre.setAAD(contexte(f))
  dechiffre.setAuthTag(octets.subarray(-16))
  const blocs: Buffer[] = []
  let pdf: Buffer | undefined
  let valide = false
  try {
    blocs.push(dechiffre.update(octets.subarray(0, -16)))
    blocs.push(dechiffre.final())
    pdf = Buffer.concat(blocs)
    if (empreintePdf(pdf) !== f.empreinte || pdf.subarray(0, 5).toString() !== '%PDF-')
      throw new Error('Archive invalide')
    valide = true
    return pdf
  } finally {
    // GCM peut produire des octets provisoires avant de refuser le tag final.
    for (const bloc of blocs) bloc.fill(0)
    if (!valide) pdf?.fill(0)
  }
}
