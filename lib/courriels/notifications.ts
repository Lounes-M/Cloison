import 'server-only'
import { createHash } from 'node:crypto'
import { clientServeur } from '@/lib/acces/serveur'

import type { SupabaseClient } from '@supabase/supabase-js'

import * as textesFr from '@/lib/content/courriels'
import * as textesEn from '@/lib/content/en/courriels'
import { gabaritCourriel as gabaritEn } from '@/lib/content/en/gabarit-courriel'
import { gabaritCourriel as gabaritFr } from '@/lib/content/gabarit-courriel'
import { choisir, LANGUES, type Langue } from '@/lib/i18n'
import { languesCourriels } from '@/lib/langue-preferee'
import { adresseDuSite, envoyer } from './envoi'
import { composerCourriel } from './gabarit'

/**
 * Les changements de statut sont programmes dans la transaction SQL.
 * Les actions et la maintenance transferent leurs courriels dans la file
 * chiffree, avec une cle stable par evenement, categorie et destinataire.
 * La distribution reseau revient au lot borne de la maintenance.
 * Aucun courriel de statut aux porteurs ne contient de lien de capacite.
 * Chaque destinataire lit le sien dans sa langue (migration 0083).
 */

type Dossier = {
  id: string
  reference: string
  statut: string
  email_locataire: string
  email_garant: string | null
  demonstration: boolean
  /** Dossier d'un second garant (0067) : le locataire et l'agence sont prevenus par le principal. */
  secondaire?: boolean
}

/**
 * Ce que chaque statut fait ecrire, et a qui. Pur, donc testable.
 *
 * `langueDe` donne la langue de chaque destinataire ; sans elle, le francais.
 * Les contacts d'une agence sont regroupes par langue : un envoi par langue.
 */
export function courrielsPour(
  dossier: Dossier,
  contactsAgence: string[],
  langueDe: (adresse: string) => Langue = () => 'fr',
) {
  const envois: {
    categorie: 'locataire' | 'garant' | 'agence'
    a: string | string[]
    sujet: string
    texte: string
    html: string
  }[] = []
  const site = adresseDuSite()
  const ajouter = (
    categorie: 'locataire' | 'garant' | 'agence',
    a: string | string[],
    langue: Langue,
    message: { sujet: string; texte: string },
    url?: string,
  ) => {
    const corps = composerCourriel(
      {
        langue,
        espace: categorie,
        sujet: message.sujet,
        paragraphes: [message.texte],
        ...(url ? { bouton: { url } } : {}),
        details: [
          {
            libelle: choisir(langue, gabaritFr, gabaritEn).reference,
            valeur: dossier.reference,
          },
        ],
      },
      site,
    )
    envois.push({ categorie, a, sujet: message.sujet, texte: corps.text, html: corps.html })
  }

  if (!dossier.secondaire) {
    const langue = langueDe(dossier.email_locataire)
    const message = choisir(langue, textesFr.locataire, textesEn.locataire)[dossier.statut]
    if (message) ajouter('locataire', dossier.email_locataire, langue, message)
  }

  if (dossier.email_garant) {
    const langue = langueDe(dossier.email_garant)
    const message = choisir(langue, textesFr.garant, textesEn.garant)[dossier.statut]
    if (message) ajouter('garant', dossier.email_garant, langue, message)
  }

  if (!dossier.secondaire && contactsAgence.length > 0) {
    for (const langue of LANGUES) {
      const contacts = contactsAgence.filter((adresse) => langueDe(adresse) === langue)
      const message = choisir(langue, textesFr.agence, textesEn.agence)[dossier.statut]
      if (!message || contacts.length === 0) continue
      ajouter(
        'agence',
        contacts,
        langue,
        { sujet: message.sujet(dossier.reference), texte: message.texte },
        `${site}/espace/dossiers/${dossier.id}`,
      )
    }
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
    const dossier = evenement.dossier as Dossier
    const contacts: string[] = evenement.contacts ?? []
    const langueDe = await languesCourriels(
      db,
      dossier.id,
      [dossier.email_locataire, dossier.email_garant, ...contacts].filter(
        (adresse): adresse is string => typeof adresse === 'string' && adresse.length > 0,
      ),
    )
    for (const envoi of courrielsPour(dossier, contacts, langueDe)) {
      for (const adresse of Array.isArray(envoi.a) ? envoi.a : [envoi.a]) {
        signal?.throwIfAborted()
        const hex = createHash('sha256')
          .update(`${evenement.id}:${envoi.categorie}:${adresse}`)
          .digest('hex')
          .slice(0, 32)
        const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
        if (
          !(await envoyer(
            adresse,
            envoi.sujet,
            { text: envoi.texte, html: envoi.html },
            id,
            undefined,
            true,
            { db, signal },
          ))
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
