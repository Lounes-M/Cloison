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
 * Les changements de statut sont programmes dans la transaction SQL.
 * Les actions et la maintenance transferent leurs courriels dans la file
 * chiffree, avec une cle stable par evenement, categorie et destinataire.
 * La distribution reseau revient au lot borne de la maintenance.
 * Aucun courriel de statut aux porteurs ne contient de lien de capacite.
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
  const envois: {
    categorie: 'locataire' | 'garant' | 'agence'
    a: string | string[]
    sujet: string
    texte: string
  }[] = []
  const signature = `\n\nRéférence du dossier : ${dossier.reference}\n\n${pied}`

  const auLocataire = textesLocataire[dossier.statut]
  if (auLocataire) {
    envois.push({
      categorie: 'locataire',
      a: dossier.email_locataire,
      sujet: auLocataire.sujet,
      texte: auLocataire.texte + signature,
    })
  }

  const auGarant = textesGarant[dossier.statut]
  if (auGarant && dossier.email_garant) {
    envois.push({
      categorie: 'garant',
      a: dossier.email_garant,
      sujet: auGarant.sujet,
      texte: auGarant.texte + signature,
    })
  }

  const aLAgence = textesAgence[dossier.statut]
  if (aLAgence && contactsAgence.length > 0) {
    envois.push({
      categorie: 'agence',
      a: contactsAgence,
      sujet: aLAgence.sujet(dossier.reference),
      texte: `${aLAgence.texte}\n\n${adresseDuSite()}/espace/dossiers/${dossier.id}${signature}`,
    })
  }

  return envois
}

/** Met en file les notifications durables sans bloquer l'action sur Resend. */
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

export async function livrerNotifications(
  db: SupabaseClient,
  dossierId?: string,
  signal?: AbortSignal,
) {
  const { data, error } = await db.rpc('notifications_a_livrer', {
    le_dossier: dossierId ?? null,
  })
  if (error) throw new Error('Notifications indisponibles')
  let echecs = 0
  for (const evenement of data ?? []) {
    signal?.throwIfAborted()
    let accepte = true
    for (const envoi of courrielsPour(evenement.dossier as Dossier, evenement.contacts ?? [])) {
      for (const adresse of Array.isArray(envoi.a) ? envoi.a : [envoi.a]) {
        signal?.throwIfAborted()
        const hex = createHash('sha256')
          .update(`${evenement.id}:${envoi.categorie}:${adresse}`)
          .digest('hex')
          .slice(0, 32)
        const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
        if (
          !(await envoyer(adresse, envoi.sujet, envoi.texte, id, undefined, true, { db, signal }))
        )
          accepte = false
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
