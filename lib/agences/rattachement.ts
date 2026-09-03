import 'server-only'

import { clientAgence } from '@/lib/acces/agence'

/**
 * Le rattachement d'un collaborateur a son agence.
 *
 * Toute la logique vit dans `rejoindre_ou_creer_agence`, posee par la migration
 * 0002 : elle lit le domaine de l'adresse confirmee, rejoint l'agence qui
 * existe deja, ou en cree une. Ce module ne fait que l'appeler et traduire ses
 * refus.
 *
 * Le detail qui donne sa forme a l'ecran : on appelle d'abord SANS nom. La base
 * repond « il me faut un nom » seulement s'il faut creer l'agence. On ne
 * demande donc jamais son nom a quelqu'un qui rejoint une agence existante,
 * puisqu'il n'aurait de toute facon pas le droit de le choisir.
 *
 * La fonction est idempotente : rappelee, elle rend l'agence deja rattachee au
 * lieu d'echouer. Un double clic n'est pas une erreur, et `/espace` peut donc
 * l'appeler a chaque visite sans precaution.
 */

/** Le code SQLSTATE que la base emet quand le nom de l'agence manque. */
const NOM_REQUIS = '22023'

/** Celui qu'elle emet pour tout refus d'acces : adresse grand public, non confirmee. */
const REFUS = '42501'

export type Rattachement =
  | { etat: 'rattache'; agenceId: string }
  | { etat: 'nom-requis' }
  | { etat: 'refus'; message: string }
  | { etat: 'panne' }

/**
 * La traduction de ce que la base a repondu, isolee de l'appel.
 *
 * Separee pour une raison simple : c'est la seule partie de ce module qui peut
 * se tromper en silence. Une comparaison de code SQLSTATE mal ecrite ferait
 * tomber un refus de domaine dans la branche « panne », et l'ecran dirait
 * « reessaie » a quelqu'un qui doit changer d'adresse. Isolee, elle s'eprouve
 * sans Supabase.
 */
export function interpreterRattachement(
  data: unknown,
  error: { code?: string; message?: string } | null,
): Rattachement {
  if (!error && typeof data === 'string' && data.length > 0) {
    return { etat: 'rattache', agenceId: data }
  }

  if (error?.code === NOM_REQUIS) return { etat: 'nom-requis' }

  if (error?.code === REFUS) {
    // Les messages de la base sont ecrits pour etre lus par une personne
    // (« Une adresse professionnelle est requise. »). On les reprend tels
    // quels plutot que d'en tenir une seconde copie ici, qui divergerait.
    return { etat: 'refus', message: error.message ?? 'Cette adresse ne convient pas.' }
  }

  return { etat: 'panne' }
}

export async function rattacher(nom?: string): Promise<Rattachement> {
  const supabase = await clientAgence()

  const { data, error } = await supabase.rpc('rejoindre_ou_creer_agence', {
    nom_souhaite: nom?.trim() || null,
  })

  const resultat = interpreterRattachement(data, error)
  if (resultat.etat === 'panne') console.error('[agence] rattachement impossible', error)

  return resultat
}
