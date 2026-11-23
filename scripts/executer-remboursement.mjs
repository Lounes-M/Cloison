import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Stripe from 'stripe'

// Envoi d'un remboursement prepare, uniquement sur confirmation retapee par l'exploitant.
// Ce lanceur n'est appele par aucune tache planifiee, aucune route ni aucun autre script.

const FORMAT = 'cloison-remboursement-prorata-v1'
const VERSION_API = '2026-09-30.endive'
const VALIDITE = 24 * 60 * 60 * 1000
const invalide = () => new Error('Remboursement invalide')
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

/** La phrase que l'exploitant doit retaper apres avoir lu la proposition. */
export function phraseDeConfirmation(proposition) {
  return `REMBOURSER ${proposition.a_rembourser_cents} centimes ${proposition.devise} sur ${proposition.reference_paiement}`
}

export function configurationExecution(valeur, maintenant = Date.now()) {
  if (
    !valeur ||
    typeof valeur !== 'object' ||
    Object.keys(valeur).sort().join(',') !== 'cle_stripe,confirmation,operation,rapport' ||
    typeof valeur.cle_stripe !== 'string' ||
    !/^[sr]k_(live|test)_[A-Za-z0-9]{8,250}$/.test(valeur.cle_stripe) ||
    typeof valeur.operation !== 'string' ||
    !uuid.test(valeur.operation) ||
    typeof valeur.confirmation !== 'string'
  )
    throw invalide()
  const rapport = valeur.rapport
  if (
    !rapport ||
    typeof rapport !== 'object' ||
    Object.keys(rapport).sort().join(',') !== 'contenu,format,sha256' ||
    rapport.format !== FORMAT ||
    typeof rapport.contenu !== 'string' ||
    Buffer.byteLength(rapport.contenu) > 64 * 1024 ||
    typeof rapport.sha256 !== 'string' ||
    createHash('sha256').update(rapport.contenu).digest('hex') !== rapport.sha256
  )
    throw invalide()
  const p = JSON.parse(rapport.contenu)
  const observe = new Date(p?.observe_le).getTime()
  if (
    p?.version !== 1 ||
    p.eligible !== true ||
    !Array.isArray(p.motifs) ||
    p.motifs.length !== 0 ||
    p.dans_le_delai !== true ||
    typeof p.reference_session !== 'string' ||
    !/^cs_[A-Za-z0-9_]{1,196}$/.test(p.reference_session) ||
    typeof p.reference_paiement !== 'string' ||
    !/^pi_[A-Za-z0-9_]{1,196}$/.test(p.reference_paiement) ||
    typeof p.devise !== 'string' ||
    !/^[a-z]{3}$/.test(p.devise) ||
    !Number.isSafeInteger(p.montant_paye_cents) ||
    !Number.isSafeInteger(p.deja_rembourse_cents) ||
    p.deja_rembourse_cents < 0 ||
    !Number.isSafeInteger(p.a_rembourser_cents) ||
    p.a_rembourser_cents < 1 ||
    p.a_rembourser_cents + p.deja_rembourse_cents > p.montant_paye_cents ||
    // Une proposition ancienne ne decrit plus l'etat du registre : la refaire.
    !Number.isFinite(observe) ||
    observe > maintenant + 300000 ||
    observe < maintenant - VALIDITE ||
    valeur.confirmation !== phraseDeConfirmation(p)
  )
    throw invalide()
  return {
    cle: valeur.cle_stripe,
    operation: valeur.operation.toLowerCase(),
    empreinte: rapport.sha256,
    proposition: p,
  }
}

/**
 * Relit le paiement chez Stripe, refuse tout ecart avec la proposition, puis
 * demande le remboursement. La cle d'idempotence vient de l'operation : rejouer
 * la meme entree apres une reponse perdue ne rembourse pas deux fois.
 */
export async function executerRemboursement(api, configuration, maintenant = Date.now()) {
  const c = configurationExecution(configuration, maintenant)
  const p = c.proposition
  const intention = await api.paymentIntents.retrieve(p.reference_paiement, {
    expand: ['latest_charge'],
  })
  const charge = intention?.latest_charge
  if (
    !intention ||
    intention.id !== p.reference_paiement ||
    intention.status !== 'succeeded' ||
    intention.currency !== p.devise ||
    intention.amount_received !== p.montant_paye_cents ||
    !charge ||
    typeof charge !== 'object' ||
    charge.paid !== true ||
    charge.disputed !== false ||
    charge.amount_refunded !== p.deja_rembourse_cents
  )
    throw new Error('Etat fournisseur different de la proposition')
  const remboursement = await api.refunds.create(
    {
      payment_intent: p.reference_paiement,
      amount: p.a_rembourser_cents,
      reason: 'requested_by_customer',
      metadata: {
        motif: 'retractation_prorata',
        operation: c.operation,
        proposition_sha256: c.empreinte,
      },
    },
    { idempotencyKey: `cloison-remboursement-${c.operation}` },
  )
  if (
    !remboursement ||
    remboursement.amount !== p.a_rembourser_cents ||
    remboursement.currency !== p.devise ||
    !['succeeded', 'pending'].includes(remboursement.status)
  )
    throw new Error('Reponse fournisseur inattendue')
  return { etat: remboursement.status }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let envoi = false
  try {
    if (process.argv.length !== 2 || process.stdin.isTTY) throw invalide()
    const blocs = []
    let taille = 0
    for await (const bloc of process.stdin) {
      taille += bloc.length
      if (taille > 128 * 1024) throw invalide()
      blocs.push(bloc)
    }
    const entree = JSON.parse(Buffer.concat(blocs).toString('utf8'))
    const c = configurationExecution(entree)
    const api = new Stripe(c.cle, { apiVersion: VERSION_API, timeout: 10000, maxNetworkRetries: 0 })
    envoi = true
    const { etat } = await executerRemboursement(api, entree)
    console.log(
      etat === 'succeeded'
        ? 'Remboursement accepte par Stripe ; verifier son arrivee dans le registre.'
        : 'Remboursement en attente chez Stripe ; verifier son arrivee dans le registre.',
    )
  } catch {
    console.error(
      envoi
        ? 'Remboursement non confirme ; verifier Stripe, puis rejouer la meme operation ou refaire la proposition.'
        : 'Remboursement refuse avant tout appel a Stripe ; aucune donnee financiere journalisee.',
    )
    process.exitCode = 1
  }
}
