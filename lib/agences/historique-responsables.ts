import 'server-only'
import { z } from 'zod'
const uuid = z.uuid()
const date = z.iso.datetime({ offset: true })
const position = z.tuple([z.literal('responsables-v1'), uuid, date, uuid])
const ligne = z.strictObject({
  id: uuid,
  quand: date,
  precedent: uuid.nullable(),
  precedent_email: z.string().max(320).nullable(),
  suivant: uuid.nullable(),
  suivant_email: z.string().max(320).nullable(),
  auteur: uuid.nullable(),
  auteur_email: z.string().max(320).nullable(),
})
export type LigneResponsable = z.infer<typeof ligne>
export function lirePositionResponsables(valeur: unknown, dossier: string) {
  if (typeof valeur !== 'string' || valeur.length > 512 || !/^[A-Za-z0-9_-]+$/.test(valeur))
    return null
  try {
    const octets = Buffer.from(valeur, 'base64url')
    if (octets.toString('base64url') !== valeur) return null
    const [, contexte, quand, id] = position.parse(JSON.parse(octets.toString('utf8')))
    return contexte.toLowerCase() === dossier.toLowerCase() ? { quand, id } : null
  } catch {
    return null
  }
}
export function pageResponsables(valeur: unknown, dossier: string) {
  const toutes = z.array(ligne).max(51).parse(valeur)
  const lignes = toutes.slice(0, 50),
    derniere = lignes.at(-1)
  return {
    lignes,
    suivant:
      toutes.length > 50 && derniere
        ? Buffer.from(
            JSON.stringify(
              position.parse(['responsables-v1', dossier, derniere.quand, derniere.id]),
            ),
          ).toString('base64url')
        : null,
  }
}
