'use server'

import { formulaireDuDossier } from '@/lib/acces/formulaire'
import type { Route } from 'next'
import { redirect } from 'next/navigation'

import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { adresseDuSite } from '@/lib/courriels/envoi'
import { creerSessionLocataire } from '@/lib/paiement/stripe'

/**
 * Le locataire regle son dossier.
 *
 * L'action se termine toujours par une redirection : vers Stripe si la session
 * s'est creee, vers son dossier sinon, avec ce qui s'est passe dans l'adresse.
 * Ce qui marque le dossier regle n'est pas ici : c'est l'evenement Stripe,
 * verifie, porte par le role `serveur`.
 */
export async function payerMonDossier(donnees: FormData): Promise<void> {
  const porteur = await capaciteDepuisCookies()
  if (
    !porteur ||
    porteur.capacite.partie !== 'locataire' ||
    !formulaireDuDossier(donnees, porteur.capacite.dossierId)
  )
    redirect('/lien-invalide')

  const supabase = clientPorteurDeLien(porteur.jeton)
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('reference, email_locataire, paye_le, agence_id, demonstration')
    .eq('id', porteur.capacite.dossierId)
    .maybeSingle()

  if (!dossier) redirect('/lien-invalide')

  // Rien a regler : deja fait, ou dossier d'agence.
  if (dossier.paye_le || dossier.agence_id || dossier.demonstration) redirect('/locataire')

  const site = adresseDuSite()
  const url = await creerSessionLocataire({
    dossierId: porteur.capacite.dossierId,
    reference: String(dossier.reference),
    email: String(dossier.email_locataire),
    retourOk: `${site}/locataire?paiement=ok`,
    retourAnnule: `${site}/locataire?paiement=annule`,
  })

  if (!url) redirect('/locataire?paiement=indisponible')

  // Une adresse Stripe, hors du site : les routes typees ne la connaissent
  // pas, et c'est normal. Le `as` dit que c'est voulu.
  redirect(url as Route)
}
