import 'server-only'
import { z } from 'zod'
import { ouvrirMaitresse, scellerMaitresse } from '@/lib/coffre/rotation-maitresse'

/**
 * Les identifiants Apimo d'une agence, scelles avant d'atteindre la base.
 *
 * Meme partage que pour les pieces (ADR 0003) : le chiffre vit chez Supabase,
 * la cle maitresse chez Vercel. Qui lit la table sans la cle n'a rien.
 *
 * L'agence et les deux identifiants sont scelles avec le jeton : un scelle
 * recopie sur la ligne d'une autre agence, ou a cote d'un autre identifiant,
 * ne s'ouvre pas. GCM refuse deja toute modification du chiffre lui-meme.
 */
export const identifiantApimo = z.string().regex(/^[0-9]{1,10}$/)
/** Caracteres imprimables sans espace : ce qu'un en-tete Basic transporte. */
export const jetonApimo = z.string().regex(/^[!-~]{8,200}$/)

const contenu = z.strictObject({
  v: z.literal(1),
  agence: z.uuid(),
  fournisseur: identifiantApimo,
  agenceApimo: identifiantApimo,
  jeton: jetonApimo,
})
export type IdentifiantsApimo = Omit<z.infer<typeof contenu>, 'v'>

const indisponible = () => new Error('Identifiants Apimo illisibles')

export function scellerIdentifiantsApimo(identifiants: IdentifiantsApimo): string {
  const clair = Buffer.from(JSON.stringify(contenu.parse({ v: 1, ...identifiants })), 'utf8')
  try {
    return scellerMaitresse(clair).toString('base64')
  } finally {
    clair.fill(0)
  }
}

/**
 * Ouvre un scelle pour l'agence et les identifiants attendus, ou echoue.
 * L'erreur est constante : elle ne dit ni pourquoi, ni rien du contenu.
 */
export function ouvrirIdentifiantsApimo(
  scelle: unknown,
  attendu: { agence: string; fournisseur: string; agenceApimo: string },
): IdentifiantsApimo {
  let clair: Buffer | undefined
  try {
    if (typeof scelle !== 'string' || !/^[A-Za-z0-9+/]{60,1400}={0,2}$/.test(scelle))
      throw indisponible()
    clair = ouvrirMaitresse(Buffer.from(scelle, 'base64'))
    const lu = contenu.parse(JSON.parse(clair.toString('utf8')))
    if (
      lu.agence !== attendu.agence ||
      lu.fournisseur !== attendu.fournisseur ||
      lu.agenceApimo !== attendu.agenceApimo
    )
      throw indisponible()
    return {
      agence: lu.agence,
      fournisseur: lu.fournisseur,
      agenceApimo: lu.agenceApimo,
      jeton: lu.jeton,
    }
  } catch {
    throw indisponible()
  } finally {
    clair?.fill(0)
  }
}
