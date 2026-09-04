import 'server-only'

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
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
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
    })

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
  if (session.payment_status !== 'paid') return null

  const dossierId = session.metadata?.dossier_id ?? session.client_reference_id
  if (!dossierId || !/^[0-9a-f-]{36}$/.test(dossierId)) return null

  return { dossierId, reference: session.id }
}
