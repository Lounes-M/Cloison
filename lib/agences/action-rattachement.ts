'use server'

import { revalidatePath } from 'next/cache'

import { rattacher } from './rattachement'

/**
 * Nommer son agence, une seule fois, par la premiere personne qui arrive.
 *
 * Cette action n'existe que pour le cas « creation » : quelqu'un dont le
 * domaine n'a pas encore d'espace. Les suivants rejoignent sans rien saisir.
 */

export type EtatNomAgence =
  { statut: 'inactif' } | { statut: 'erreur'; message: string; valeur?: string }

export async function nommerAgence(
  _precedent: EtatNomAgence,
  donnees: FormData,
): Promise<EtatNomAgence> {
  const saisie = String(donnees.get('nom') ?? '').trim()

  // La base exige deux caracteres au minimum. On le verifie aussi ici, pour
  // rendre un message tout de suite plutot qu'un aller-retour.
  if (saisie.length < 2) {
    return { statut: 'erreur', message: 'Le nom de ton agence est requis.', valeur: saisie }
  }

  if (saisie.length > 120) {
    return { statut: 'erreur', message: 'Ce nom est trop long.', valeur: saisie.slice(0, 120) }
  }

  const resultat = await rattacher(saisie)

  if (resultat.etat === 'rattache') {
    // La page relit le rattachement au rendu suivant : elle trouvera l'agence
    // et affichera l'espace au lieu de reposer la question.
    revalidatePath('/espace')
    return { statut: 'inactif' }
  }

  if (resultat.etat === 'refus') {
    return { statut: 'erreur', message: resultat.message, valeur: saisie }
  }

  return {
    statut: 'erreur',
    message: "L'enregistrement n'a pas abouti. Reessaie dans un instant.",
    valeur: saisie,
  }
}
