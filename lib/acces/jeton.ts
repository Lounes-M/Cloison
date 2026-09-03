import 'server-only'

import { SignJWT, jwtVerify } from 'jose'
import { env } from '@/lib/env'

/**
 * Le jeton de capacite du garant et du locataire.
 *
 * Ce qui autorise, c'est ce jeton, jamais l'adresse e-mail : celle-ci n'est
 * qu'un canal de livraison (ADR 0006). Le contrat qu'il doit remplir a ete
 * fixe par la migration 0003, avant que ce fichier existe :
 *
 *   role         `porteur_lien`, pour que Postgres prenne le bon role
 *   dossier_id   lu par `public.dossier_courant()`
 *   role_partie  lu par `public.partie_courante()`, seule chose qui distingue
 *                le garant du locataire, qui partagent le meme role Postgres
 *
 * Deux verifications, et il faut les deux. La signature prouve que le jeton
 * vient de nous et n'a pas ete modifie ; le `jti` prouve qu'il est encore
 * celui qui vaut. Un jeton parfaitement signe mais revoque doit etre refuse,
 * sinon la reemission ne revoquerait rien.
 */

export type Partie = 'locataire' | 'garant'

/**
 * Sept jours.
 *
 * Assez pour qu'un garant retrouve trois bulletins de paie sur un week-end
 * sans se faire ejecter en cours de depot, assez court pour qu'un e-mail
 * transfere ne rouvre pas un dossier des semaines plus tard. Le lien restant
 * reemissible, une expiration coute un clic et pas un dossier.
 */
export const DUREE_JETON = '7 days'
const DUREE_JETON_SECONDES = 7 * 24 * 60 * 60

/** Le role Postgres que le jeton fait endosser. */
const ROLE_POSTGRES = 'porteur_lien'

export type Capacite = {
  dossierId: string
  partie: Partie
  jti: string
}

function cle() {
  return new TextEncoder().encode(env.supabaseJwtSecret)
}

/**
 * Signe un jeton pour un `jti` deja emis en base.
 *
 * L'ordre compte : la base tire le `jti` et revoque le precedent, puis on
 * signe. L'inverse laisserait exister un jeton signe que la base ne reconnait
 * pas, donc inutilisable mais bien forme.
 */
export async function signerJeton(
  dossierId: string,
  partie: Partie,
  jti: string,
  expireLe: Date,
): Promise<string> {
  return new SignJWT({ role: ROLE_POSTGRES, dossier_id: dossierId, role_partie: partie })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(Math.floor(expireLe.getTime() / 1000))
    .sign(cle())
}

/**
 * Verifie la signature et la forme, sans interroger la base.
 *
 * Renvoie `null` sur tout echec, et ne dit jamais lequel : une erreur
 * detaillee apprendrait a qui essaie si c'est la signature, l'expiration ou
 * l'algorithme qui a cede.
 *
 * `algorithms` est fige a HS256, en defense en profondeur et non comme seule
 * barriere : verifie par l'essai, `jose` refuse deja `alg: none` de lui-meme
 * des lors qu'on lui passe une cle symetrique. Retirer la contrainte ne fait
 * donc rien echouer aujourd'hui. On la garde parce qu'elle rend l'intention
 * explicite et qu'elle survivrait a un changement de bibliotheque, pas parce
 * qu'elle serait ce qui nous protege.
 */
export async function verifierSignature(jeton: string): Promise<Capacite | null> {
  try {
    const { payload } = await jwtVerify(jeton, cle(), { algorithms: ['HS256'] })

    const dossierId = payload.dossier_id
    const partie = payload.role_partie
    const jti = payload.jti

    if (payload.role !== ROLE_POSTGRES) return null
    if (typeof dossierId !== 'string' || typeof jti !== 'string') return null
    if (partie !== 'locataire' && partie !== 'garant') return null

    return { dossierId, partie, jti }
  } catch {
    return null
  }
}

export { DUREE_JETON_SECONDES }
