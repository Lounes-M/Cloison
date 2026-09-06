'use server'

import { revalidatePath } from 'next/cache'

import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { prevenirSiLeStatutAChange, statutActuel } from '@/lib/courriels/notifications'
import { montantEnCents } from '@/lib/garant/validation'

/**
 * Le locataire saisit son loyer.
 *
 * Deuxieme et derniere chose qu'il ecrit, apres l'adresse de son garant : la
 * migration 0011 lui accorde la colonne `loyer_cents`, et la politique de la
 * 0003 borne l'ecriture a son propre dossier. C'est un des deux termes du
 * ratio ; l'autre, le revenu, est au garant.
 */

export type EtatLoyer =
  | { statut: 'inactif' }
  | { statut: 'enregistre' }
  | { statut: 'erreur'; message: string; valeur?: string }

export async function saisirMonLoyer(_precedent: EtatLoyer, donnees: FormData): Promise<EtatLoyer> {
  const saisie = String(donnees.get('loyer') ?? '')
  const cents = montantEnCents(saisie)

  if (cents === 'invalide' || cents === null) {
    return {
      statut: 'erreur',
      message: 'Le loyer ne se lit pas. Exemple : 850 ou 850,50.',
      valeur: saisie,
    }
  }

  const porteur = await capaciteDepuisCookies()
  if (!porteur || porteur.capacite.partie !== 'locataire') {
    return { statut: 'erreur', message: 'Ton lien a expire. Demande-en un nouveau.' }
  }

  try {
    const supabase = clientPorteurDeLien(porteur.jeton)
    const avant = await statutActuel(supabase, porteur.capacite.dossierId)

    const { error } = await supabase
      .from('dossiers')
      .update({ loyer_cents: cents })
      .eq('id', porteur.capacite.dossierId)

    if (error) {
      console.error('[locataire] loyer refuse')
      return {
        statut: 'erreur',
        message: "L'enregistrement n'a pas abouti. Reessaie dans un instant.",
        valeur: saisie,
      }
    }

    // Le loyer est l'autre terme du ratio : si le garant avait deja tout
    // depose, c'est cette saisie qui tranche.
    await prevenirSiLeStatutAChange(supabase, porteur.capacite.dossierId, avant)
  } catch {
    console.error('[locataire] loyer impossible')
    return {
      statut: 'erreur',
      message: "L'enregistrement n'a pas abouti. Reessaie dans un instant.",
      valeur: saisie,
    }
  }

  revalidatePath('/locataire')
  return { statut: 'enregistre' }
}
