import 'server-only'
import { estUuidCanonique } from '@/lib/validation/uuid'
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
  return new Stripe(env.stripeSecretKey, { timeout: 5000, maxNetworkRetries: 0 })
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
  tarifAttendu?: { version: string; montant: number }
}): Promise<string | null> {
  try {
    const db = await clientServeur()
    const api = stripe()
    const { error: reservation } = await db.from('sessions_paiement').upsert(
      {
        dossier_id: options.dossierId,
        tarif_version: tarifs.versionLocataire,
        montant_cents: tarifs.locataireCents,
        devise: 'eur',
      },
      { onConflict: 'dossier_id', ignoreDuplicates: true },
    )
    if (reservation) return null
    const { data: etat, error: lecture } = await db
      .from('sessions_paiement')
      .select('tentative,session_ref,cree_le,tarif_version,montant_cents,devise')
      .eq('dossier_id', options.dossierId)
      .single()
    if (
      lecture ||
      !etat ||
      typeof etat.tarif_version !== 'string' ||
      !/^[a-z0-9-]{1,64}$/.test(etat.tarif_version) ||
      !Number.isSafeInteger(etat.montant_cents) ||
      etat.montant_cents < 1 ||
      etat.montant_cents > 100000000 ||
      etat.devise !== 'eur'
    )
      return null
    if (
      options.tarifAttendu &&
      (options.tarifAttendu.version !== etat.tarif_version ||
        options.tarifAttendu.montant !== etat.montant_cents)
    )
      return null
    let tentative = String(etat.tentative)
    if (etat.session_ref) {
      const ancienne = await api.checkout.sessions.retrieve(etat.session_ref)
      if (ancienne.status === 'open') {
        // Une reference conservee ne suffit pas : le paiement propose doit
        // encore correspondre au dossier et au devis reserve en base.
        if (
          ancienne.id !== etat.session_ref ||
          ancienne.mode !== 'payment' ||
          ancienne.payment_status !== 'unpaid' ||
          ancienne.metadata?.dossier_id?.toLowerCase() !== options.dossierId.toLowerCase() ||
          (ancienne.client_reference_id != null &&
            ancienne.client_reference_id.toLowerCase() !== options.dossierId.toLowerCase()) ||
          ancienne.amount_total !== etat.montant_cents ||
          ancienne.currency !== etat.devise ||
          (ancienne.metadata?.tarif_version ?? 'locataire-2026-09-04') !== etat.tarif_version
        )
          return null
        return ancienne.url
      }
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
    } else {
      const age = Date.now() - new Date(etat.cree_le).getTime()
      // Marge avant la retention minimale Stripe de 24 h ; une date incoherente
      // ne doit pas prolonger cette fenetre. Tolerance de cinq minutes entre horloges.
      if (!Number.isFinite(age) || age < -5 * 60 * 1000 || age >= 23 * 60 * 60 * 1000) {
        console.error('[paiement] tentative a reconcilier')
        return null
      }
    }
    const session = await api.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: options.email,
        client_reference_id: options.dossierId,
        metadata: {
          dossier_id: options.dossierId,
          reference: options.reference,
          tarif_version: etat.tarif_version,
        },
        payment_intent_data: {
          metadata: {
            dossier_id: options.dossierId,
            tarif_version: etat.tarif_version,
            produit: 'cloison_locataire',
          },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: etat.montant_cents,
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
    const { data: confirmation, error: inscription } = await db
      .from('sessions_paiement')
      .update({ session_ref: session.id })
      .eq('dossier_id', options.dossierId)
      .eq('tentative', tentative)
      .select('session_ref')
    // Une reponse sans erreur peut pourtant n'avoir modifie aucune ligne :
    // dossier supprime ou tentative remplacee pendant l'appel a Stripe.
    if (inscription || confirmation?.length !== 1 || confirmation[0]?.session_ref !== session.id)
      return null

    return session.url ?? null
  } catch {
    // Les erreurs du SDK peuvent contenir l'adresse client ou d'autres donnees brutes.
    console.error('[paiement] session impossible')
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
  } catch {
    // L'erreur du SDK contient le corps brut du webhook dans payload.
    // Une signature refusee ne doit jamais copier ce contenu dans les logs.
    console.error('[paiement] evenement refuse')
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
  if (!estUuidCanonique(dossierId)) return null

  return { dossierId, reference: session.id }
}

/** Lecture fournisseur ciblee, avant de rattacher un remboursement ou un litige. */
export async function retrouverSessionFinanciere(
  referencePaiement: string,
): Promise<{ reference_session: string; le_dossier: string } | null> {
  if (!/^pi_[A-Za-z0-9_]{1,190}$/.test(referencePaiement))
    throw new Error('Reference financiere invalide')
  const resultat = await stripe().checkout.sessions.list({
    payment_intent: referencePaiement,
    limit: 2,
  })
  if (resultat.data.length === 0) return null
  if (resultat.has_more || resultat.data.length !== 1) throw new Error('Session financiere ambigue')
  const session = resultat.data[0]!
  const dossier = session.metadata?.dossier_id
  if (!dossier) return null
  if (
    session.mode !== 'payment' ||
    !/^cs_[A-Za-z0-9_]{1,190}$/.test(session.id) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dossier) ||
    (session.client_reference_id &&
      session.client_reference_id.toLowerCase() !== dossier.toLowerCase())
  )
    throw new Error('Session financiere incoherente')
  const paiement =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (paiement !== referencePaiement) throw new Error('Reference financiere incoherente')
  return { reference_session: session.id, le_dossier: dossier }
}

/** Snapshot de la session fournisseur ; aucune creation, capture ni restitution de fonds. */
export async function lireSessionPourRapprochement(referenceSession: string) {
  if (!/^cs_[A-Za-z0-9_]{1,190}$/.test(referenceSession))
    throw new Error('Reference financiere invalide')
  const session = await stripe().checkout.sessions.retrieve(referenceSession)
  const dossier = session.metadata?.dossier_id
  const paiement =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null)
  if (
    session.id !== referenceSession ||
    !dossier ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dossier) ||
    (session.client_reference_id &&
      session.client_reference_id.toLowerCase() !== dossier.toLowerCase()) ||
    session.mode !== 'payment' ||
    !Number.isSafeInteger(session.amount_total) ||
    session.amount_total! < 1 ||
    session.amount_total! > 100000000 ||
    !session.currency ||
    !/^[a-z]{3}$/.test(session.currency) ||
    (paiement !== null && !/^pi_[A-Za-z0-9_]{1,190}$/.test(paiement))
  )
    throw new Error('Session financiere incoherente')
  return {
    reference_session: referenceSession,
    reference_paiement: paiement,
    le_dossier: dossier,
    montant: session.amount_total!,
    devise: session.currency,
    version_tarif: session.metadata?.tarif_version ?? 'locataire-2026-09-04',
    paye: session.payment_status === 'paid',
  }
}

export type ReservationActe = {
  id: string
  facture: string
  montant: number
  tarif: string
  session: string | null
  cree_le: string
}
/** La meme reservation et les memes parametres restent utilises apres une interruption. */
export async function creerSessionActe(
  r: ReservationActe,
  origine: string,
): Promise<string | null> {
  const api = stripe()
  let session: Stripe.Checkout.Session
  if (r.session) session = await api.checkout.sessions.retrieve(r.session)
  else {
    const age = Date.now() - Date.parse(r.cree_le)
    if (!Number.isFinite(age) || age < -300000 || age >= 23 * 3600000)
      throw new Error('Reglement a rapprocher')
    session = await api.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: r.facture,
        metadata: {
          produit: 'cloison_acte',
          facture_id: r.facture,
          tentative: r.id,
          tarif_version: r.tarif,
        },
        payment_intent_data: {
          metadata: { produit: 'cloison_acte', facture_id: r.facture, tentative: r.id },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: r.montant,
              product_data: { name: 'Acte Cloison signe' },
            },
          },
        ],
        success_url: `${origine}/espace/facturation`,
        cancel_url: `${origine}/espace/facturation`,
        locale: 'fr',
      },
      { idempotencyKey: `cloison-acte:${r.id}` },
    )
  }
  if (
    !session.livemode ||
    session.metadata?.produit !== 'cloison_acte' ||
    session.metadata.facture_id !== r.facture ||
    session.metadata.tentative !== r.id ||
    session.metadata.tarif_version !== r.tarif ||
    session.amount_total !== r.montant ||
    session.currency !== 'eur' ||
    session.mode !== 'payment' ||
    session.client_reference_id !== r.facture
  )
    throw new Error('Reglement incoherent')
  const db = await clientServeur()
  const lien = await db.rpc('rattacher_reglement_acte', { le_id: r.id, la_session: session.id })
  if (lien.error || lien.data !== true) throw new Error('Reglement non confirme')
  if (session.status !== 'open' || session.payment_status !== 'unpaid') {
    await rapprocherSessionActe(session.id, r.id)
    return null
  }
  if (!session.url || new URL(session.url).origin !== 'https://checkout.stripe.com')
    throw new Error('Destination invalide')
  return session.url
}
/** Un webhook sert de reveil : la decision utilise une lecture fournisseur courante. */
export async function rapprocherSessionActe(
  reference: string,
  tentative?: string,
  signal = AbortSignal.timeout(20000),
) {
  signal.throwIfAborted()
  if (!/^cs_[A-Za-z0-9_]{1,190}$/.test(reference)) throw new Error('Reference invalide')
  const s = await stripe().checkout.sessions.retrieve(reference, {
    expand: ['payment_intent.latest_charge'],
  })
  const m = s.metadata
  if (
    s.id !== reference ||
    !s.livemode ||
    s.mode !== 'payment' ||
    m?.produit !== 'cloison_acte' ||
    !estUuidCanonique(m.facture_id) ||
    !estUuidCanonique(m.tentative) ||
    (tentative && tentative !== m.tentative) ||
    s.client_reference_id !== m.facture_id ||
    !m.tarif_version ||
    s.currency !== 'eur' ||
    !Number.isSafeInteger(s.amount_total) ||
    s.amount_total! < 1
  )
    throw new Error('Reglement incoherent')
  const paiement = typeof s.payment_intent === 'object' ? s.payment_intent : null
  const charge =
    paiement && typeof paiement.latest_charge === 'object' ? paiement.latest_charge : null
  const paye = s.payment_status === 'paid'
  if (
    paye &&
    (!paiement ||
      !charge ||
      paiement.status !== 'succeeded' ||
      !charge.paid ||
      charge.amount !== s.amount_total ||
      charge.currency !== 'eur')
  )
    throw new Error('Paiement incomplet')
  const statut = paye
    ? 'paye'
    : s.status === 'expired'
      ? 'expire'
      : s.status === 'open'
        ? 'ouvert'
        : null
  if (!statut) throw new Error('Paiement a revoir')
  signal.throwIfAborted()
  const db = await clientServeur(signal)
  const lien = await db.rpc('rattacher_reglement_acte', { le_id: m.tentative, la_session: s.id })
  // Un reglement deja paye ne se rattache plus : la confirmation reste idempotente.
  if (lien.error) throw new Error('Reglement indisponible')
  const r = await db.rpc('rapprocher_reglement_acte', {
    le_id: m.tentative,
    la_facture: m.facture_id,
    la_session: s.id,
    le_paiement: paiement?.id ?? null,
    montant: s.amount_total,
    devise: s.currency,
    tarif: m.tarif_version,
    statut,
    rembourse: charge?.amount_refunded ?? 0,
    conteste: charge?.disputed ?? false,
  })
  if (r.error || r.data !== true) throw new Error('Reglement non rapproche')
}
export async function traiterEvenementActe(
  e: Stripe.Event,
  signal = AbortSignal.timeout(20000),
): Promise<boolean> {
  signal.throwIfAborted()
  if (e.type.startsWith('checkout.session.')) {
    const s = e.data.object as Stripe.Checkout.Session
    if (s.metadata?.produit !== 'cloison_acte') return false
    await rapprocherSessionActe(s.id, undefined, signal)
    return true
  }
  if (e.type === 'charge.refunded' || e.type.startsWith('charge.dispute.')) {
    const o = e.data.object as Stripe.Charge | Stripe.Dispute
    const pi = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id
    if (!pi) return false
    const sessions = await stripe().checkout.sessions.list({ payment_intent: pi, limit: 2 })
    const s = sessions.data.find((s) => s.metadata?.produit === 'cloison_acte')
    if (!s) return false
    if (sessions.has_more || sessions.data.length !== 1) throw new Error('Reglement ambigu')
    await rapprocherSessionActe(s.id, undefined, signal)
    return true
  }
  return false
}
