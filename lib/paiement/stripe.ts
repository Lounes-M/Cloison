import 'server-only'
import { randomUUID } from 'node:crypto'
import { clientServeur } from '@/lib/acces/serveur'

import Stripe from 'stripe'

import { tarifs } from '@/lib/content/tarifs'
import { env } from '@/lib/env'

/**
 * Stripe, et rien que Stripe.
 *
 * Ce module est le seul du depot a importer la bibliotheque, et le test des
 * invariants l'y tient : `lib/paiement/` ne s'importe jamais depuis ce qui
 * s'execute pour le garant. Le garant ne paie jamais, sinon ca ne part pas.
 *
 * Checkout hebergee : aucune donnee de carte ne passe par nous, ce qui est
 * exactement ce qu'on veut d'un produit dont la promesse est de ne pas voir
 * ce qu'il n'a pas a voir.
 */

function stripe(): Stripe {
  return new Stripe(env.stripeSecretKey)
}

/**
 * La session de paiement du locataire.
 *
 * Le dossier est nomme deux fois, en `client_reference_id` et en metadonnee :
 * le premier se lit dans le tableau de bord Stripe, le second revient dans
 * l'evenement. Le montant vient du contenu, jamais d'ici.
 */
export async function creerSessionLocataire(options: {
  dossierId: string
  reference: string
  email: string
  retourOk: string
  retourAnnule: string
}): Promise<string | null> {
  try {
    const db = await clientServeur()
    const api = stripe()
    const { error: reservation } = await db
      .from('sessions_paiement')
      .upsert(
        { dossier_id: options.dossierId },
        { onConflict: 'dossier_id', ignoreDuplicates: true },
      )
    if (reservation) return null
    const { data: etat, error: lecture } = await db
      .from('sessions_paiement')
      .select('tentative,session_ref,cree_le')
      .eq('dossier_id', options.dossierId)
      .single()
    if (lecture || !etat) return null
    let tentative = String(etat.tentative)
    if (etat.session_ref) {
      const ancienne = await api.checkout.sessions.retrieve(etat.session_ref)
      if (ancienne.status === 'open') return ancienne.url
      if (ancienne.status !== 'expired') return null
      // Seule une session definitivement expiree peut etre remplacee.
      tentative = randomUUID()
      const { data: rotation, error } = await db
        .from('sessions_paiement')
        .update({ tentative, session_ref: null, cree_le: new Date().toISOString() })
        .eq('dossier_id', options.dossierId)
        .eq('tentative', etat.tentative)
        .select('tentative')
      if (error || rotation?.length !== 1) return null
    } else if (Date.now() - new Date(etat.cree_le).getTime() > 23 * 60 * 60 * 1000) {
      // Stripe ne garantit plus l'idempotence apres 24 h : reconciliation requise.
      console.error('[paiement] tentative a reconcilier', options.dossierId)
      return null
    }
    const session = await api.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: options.email,
        client_reference_id: options.dossierId,
        metadata: { dossier_id: options.dossierId, reference: options.reference },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: tarifs.locataireCents,
              product_data: {
                name: `Dossier Cloison ${options.reference}`,
                description: 'Trois mois de coffre pour un dossier de garantie locative.',
              },
            },
          },
        ],
        success_url: options.retourOk,
        cancel_url: options.retourAnnule,
        locale: 'fr',
      },
      { idempotencyKey: `cloison:${options.dossierId}:${tentative}` },
    )
    const { error: inscription } = await db
      .from('sessions_paiement')
      .update({ session_ref: session.id })
      .eq('dossier_id', options.dossierId)
      .eq('tentative', tentative)
    if (inscription) return null

    return session.url ?? null
  } catch (erreur) {
    console.error('[paiement] session impossible', erreur)
    return null
  }
}

export type PaiementConfirme = { dossierId: string; reference: string }

/**
 * Lit un evenement Stripe, ou refuse.
 *
 * La signature est la seule chose qui distingue Stripe de n'importe qui : sans
 * elle, un `POST` forge marquerait n'importe quel dossier regle. Elle se
 * verifie sur le corps brut, octet pour octet.
 */
export function lireEvenement(corps: string, signature: string | null): Stripe.Event | null {
  if (!signature) return null
  try {
    return stripe().webhooks.constructEvent(corps, signature, env.stripeWebhookSecret)
  } catch (erreur) {
    console.error('[paiement] evenement refuse', erreur)
    return null
  }
}

/** Ce qu'un evenement de session terminee nous dit, ou rien. */
export function paiementConfirme(evenement: Stripe.Event): PaiementConfirme | null {
  if (evenement.type !== 'checkout.session.completed') return null

  const session = evenement.data.object
  if (
    session.payment_status !== 'paid' ||
    session.mode !== 'payment' ||
    session.currency !== 'eur' ||
    session.amount_total !== tarifs.locataireCents
  )
    return null

  const dossierId = session.metadata?.dossier_id ?? session.client_reference_id
  if (!dossierId || !/^[0-9a-f-]{36}$/.test(dossierId)) return null

  return { dossierId, reference: session.id }
}
