'use server'

import { traducteur } from '@/lib/messages'
import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { sessionPorteur as sessionPorteurFr } from '@/lib/content/session-porteur'

import { revalidatePath } from 'next/cache'

import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { prevenirSiLeStatutAChange, statutActuel } from '@/lib/courriels/notifications'
import { lireLoyer, messageLoyer } from '@/lib/garant/validation'
import { sessionPorteur as sessionPorteurEn } from '@/lib/content/en/session-porteur'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

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
  const langue = await langueEspace()
  const dire = traducteur(langue)
  const sessionPorteur = choisir(langue, sessionPorteurFr, sessionPorteurEn)

  const saisie = String(donnees.get('loyer') ?? '')
  const lu = lireLoyer(saisie)

  if (!lu.ok || lu.cents === null) {
    return {
      statut: 'erreur',
      message: messageLoyer(!lu.ok ? lu.motif : 'illisible', langue),
      valeur: saisie,
    }
  }
  const cents = lu.cents

  const porteur = await capaciteDepuisCookies()
  if (porteur && !formulaireDuDossier(donnees, porteur.capacite.dossierId)) {
    return { statut: 'erreur', message: sessionPorteur.autreDossier }
  }
  if (!porteur || porteur.capacite.partie !== 'locataire') {
    return { statut: 'erreur', message: dire('Ton lien a expiré. Demande-en un nouveau.') }
  }

  try {
    const supabase = clientPorteurDeLien(porteur.jeton)
    const avant = await statutActuel(supabase, porteur.capacite.dossierId)

    const { data: enregistre, error } = await supabase
      .from('dossiers')
      .update({ loyer_cents: cents })
      .eq('id', porteur.capacite.dossierId)
      .select('id')
      .maybeSingle()

    if (error || !enregistre) {
      console.error('[locataire] loyer refuse')
      return {
        statut: 'erreur',
        message: dire("L'enregistrement n'a pas abouti. Réessaie dans un instant."),
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
      message: dire("L'enregistrement n'a pas abouti. Réessaie dans un instant."),
      valeur: saisie,
    }
  }

  revalidatePath('/locataire')
  return { statut: 'enregistre' }
}
