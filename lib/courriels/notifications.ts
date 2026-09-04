import 'server-only'

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
  const { data } = await supabase
    .from('dossiers')
    .select('id, reference, statut, email_locataire, email_garant, demonstration')
    .eq('id', dossierId)
    .maybeSingle()

  if (!data || data.statut === statutAvant || data.demonstration) return

  const dossier: Dossier = {
    id: String(data.id),
    reference: String(data.reference),
    statut: String(data.statut),
    email_locataire: String(data.email_locataire),
    email_garant: data.email_garant ? String(data.email_garant) : null,
    demonstration: Boolean(data.demonstration),
  }

  let contacts: string[] = []
  if (textesAgence[dossier.statut]) {
    const { data: adresses, error } = await supabase.rpc('contacts_agence_du_dossier', {
      le_dossier: dossierId,
    })
    if (error) console.error('[courriel] contacts de l agence illisibles', error)
    contacts = Array.isArray(adresses) ? adresses.map(String) : []
  }

  for (const envoi of courrielsPour(dossier, contacts)) {
    await envoyer(envoi.a, envoi.sujet, envoi.texte)
  }
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
