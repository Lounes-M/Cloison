import 'server-only'
import { createHash } from 'node:crypto'
import { clientServeur } from '@/lib/acces/serveur'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  agence as textesAgence,
  garant as textesGarant,
  locataire as textesLocataire,
  pied,
} from '@/lib/content/courriels'
import { adresseDuSite, envoyer } from './envoi'

/**
 * Prevenir qui doit l'etre quand un dossier change d'etat.
 *
 * Les changements de statut naissent dans la base, par les declencheurs de la
 * migration 0011, et la base n'envoie pas de courriel. C'est donc chaque action
 * qui, apres avoir ecrit, relit le statut et previent si elle l'a fait changer.
 * Le contrat de ce module : on lui dit ce qu'etait le statut avant, il regarde
 * ce qu'il est maintenant.
 *
 * Aucun courriel a un porteur de lien ne contient de lien. En emettre un
 * nouveau revoquerait celui qu'il tient, et sa session en cours tomberait.
 */

type Dossier = {
  id: string
  reference: string
  statut: string
  email_locataire: string
  email_garant: string | null
  demonstration: boolean
}

/** Ce que chaque statut fait ecrire, et a qui. Pur, donc testable. */
export function courrielsPour(dossier: Dossier, contactsAgence: string[]) {
  const envois: { a: string | string[]; sujet: string; texte: string }[] = []
  const signature = `\n\nRéférence du dossier : ${dossier.reference}\n\n${pied}`

  const auLocataire = textesLocataire[dossier.statut]
  if (auLocataire) {
    envois.push({
      a: dossier.email_locataire,
      sujet: auLocataire.sujet,
      texte: auLocataire.texte + signature,
    })
  }

  const auGarant = textesGarant[dossier.statut]
  if (auGarant && dossier.email_garant) {
    envois.push({
      a: dossier.email_garant,
      sujet: auGarant.sujet,
      texte: auGarant.texte + signature,
    })
  }

  const aLAgence = textesAgence[dossier.statut]
  if (aLAgence && contactsAgence.length > 0) {
    envois.push({
      a: contactsAgence,
      sujet: aLAgence.sujet(dossier.reference),
      texte: `${aLAgence.texte}\n\n${adresseDuSite()}/espace/dossiers/${dossier.id}${signature}`,
    })
  }

  return envois
}

/**
 * Relit le dossier et previent si le statut a change.
 *
 * `supabase` est le client de celui qui vient d'ecrire : la RLS decide de ce
 * qu'il relit, et `contacts_agence_du_dossier` de ce qu'il apprend de
 * l'agence. Un dossier de demonstration ne previent personne : ses adresses
 * n'existent pas.
 */
export async function prevenirSiLeStatutAChange(
  supabase: SupabaseClient,
  dossierId: string,
  statutAvant: string | null,
): Promise<void> {
  // Les arguments historiques restent pour les appelants. La transaction SQL
  // determine les changements, meme si le processus tombe apres l'ecriture.
  void supabase
  void statutAvant
  try {
    await livrerNotifications(await clientServeur(), dossierId)
  } catch {
    console.error('[courriel] notifications en attente de reprise')
  }
}

export async function livrerNotifications(db: SupabaseClient, dossierId?: string) {
  const { data, error } = await db.rpc('notifications_a_livrer', {
    le_dossier: dossierId ?? null,
  })
  if (error) throw new Error('Notifications indisponibles')
  let echecs = 0
  for (const evenement of data ?? []) {
    let accepte = true
    for (const envoi of courrielsPour(evenement.dossier as Dossier, evenement.contacts ?? [])) {
      for (const adresse of Array.isArray(envoi.a) ? envoi.a : [envoi.a]) {
        const hex = createHash('sha256')
          .update(`${evenement.id}:${adresse}`)
          .digest('hex')
          .slice(0, 32)
        const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
        if (!(await envoyer(adresse, envoi.sujet, envoi.texte, id))) accepte = false
      }
    }
    if (accepte) {
      const { error } = await db.rpc('acquitter_notification', { identifiant: evenement.id })
      if (error) echecs++
    } else echecs++
  }
  return { echecs }
}

/** Le statut d'un dossier tel qu'il est maintenant, pour le comparer apres. */
export async function statutActuel(
  supabase: SupabaseClient,
  dossierId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('dossiers')
    .select('statut')
    .eq('id', dossierId)
    .maybeSingle()
  return data ? String(data.statut) : null
}
