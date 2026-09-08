import 'server-only'
import { z } from 'zod'
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const position = z.tuple([uuid, z.string().datetime({ offset: true }), uuid])
export type CurseurJournal = { quand: string; id: string }
export type EntreeJournal = CurseurJournal & {
  action: string
  acteur: string
  identite: string | null
}
export function lireCurseurJournal(valeur: unknown, dossier: string): CurseurJournal | null {
  if (typeof valeur !== 'string' || valeur.length > 512 || !/^[A-Za-z0-9_-]+$/.test(valeur))
    return null
  try {
    const octets = Buffer.from(valeur, 'base64url')
    if (octets.toString('base64url') !== valeur) return null
    const [contexte, quand, id] = position.parse(JSON.parse(octets.toString('utf8')))
    return contexte.toLowerCase() === dossier.toLowerCase() ? { quand, id } : null
  } catch {
    return null
  }
}
export function pageJournal(journal: EntreeJournal[] | null, dossier: string) {
  const lignes = (journal ?? []).slice(0, 50)
  const derniere = lignes.at(-1)
  let suivant: string | null = null
  if ((journal?.length ?? 0) > 50 && derniere) {
    const controle = position.safeParse([dossier, derniere.quand, derniere.id])
    if (!controle.success) throw new Error('Historique non conforme')
    suivant = Buffer.from(JSON.stringify(controle.data)).toString('base64url')
  }
  return { lignes, suivant }
}
