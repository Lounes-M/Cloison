import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { env } from '@/lib/env'
import { VOLUMES, type DemandeAgence } from './schema'

/**
 * Enregistrement d'une demande d'agence, puis notification.
 *
 * L'ordre n'est pas anodin : on ecrit d'abord, on notifie ensuite. Si l'e-mail
 * echoue, la demande est deja en base et rien n'est perdu — l'inverse aurait
 * fait dependre la conservation du lead de la disponibilite d'un service tiers.
 */

/** Code de contrainte unique violee, cote Postgres. */
const DOUBLON = '23505'

export type ResultatEnregistrement =
  { statut: 'enregistree' } | { statut: 'deja-connue' } | { statut: 'echec'; raison: string }

function clientSupabase() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function enregistrerDemande(
  demande: DemandeAgence,
  source: string,
): Promise<ResultatEnregistrement> {
  const { error } = await clientSupabase()
    .from('demandes_agence')
    .insert({
      nom_agence: demande.nomAgence,
      email: demande.email,
      ville: demande.ville,
      dossiers_par_an: demande.dossiersParAn,
      message: demande.message ?? null,
      source,
    })

  if (error) {
    // Une agence qui envoie deux fois n'a pas commis d'erreur : on le lui dit
    // comme d'une reussite, et on ne renotifie pas.
    if (error.code === DOUBLON) return { statut: 'deja-connue' }

    console.error('[demande-agence] insertion refusée', {
      code: error.code,
      message: error.message,
    })
    return { statut: 'echec', raison: error.message }
  }

  return { statut: 'enregistree' }
}

/**
 * Notifie qu'une demande est arrivee.
 *
 * Ne leve jamais : une notification perdue ne doit pas transformer une demande
 * correctement enregistree en erreur affichee a l'agence. L'echec part dans les
 * logs, la demande reste consultable dans Supabase.
 */
export async function notifierDemande(demande: DemandeAgence): Promise<void> {
  const volume = VOLUMES.find((v) => v.valeur === demande.dossiersParAn)?.libelle
  const sujet = `Nouvelle agence — ${demande.nomAgence} (${demande.ville})`

  const corps = [
    `Agence   : ${demande.nomAgence}`,
    `Ville    : ${demande.ville}`,
    `E-mail   : ${demande.email}`,
    `Dossiers : ${volume ?? demande.dossiersParAn} par an`,
    demande.message ? `\nMessage :\n${demande.message}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { error } = await new Resend(env.resendApiKey).emails.send({
      from: env.emailExpediteur,
      to: env.emailDestinataire,
      replyTo: demande.email,
      subject: sujet,
      text: corps,
    })

    if (error) {
      console.error('[demande-agence] notification non envoyée', error)
    }
  } catch (erreur) {
    console.error('[demande-agence] notification non envoyée', erreur)
  }
}
