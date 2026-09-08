import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { rpc, serveur, retrouver } = vi.hoisted(() => ({
  rpc: vi.fn(),
  serveur: vi.fn(),
  retrouver: vi.fn(),
}))
vi.mock('@/lib/paiement/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/paiement/stripe')>()),
  retrouverSessionFinanciere: retrouver,
}))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: serveur }))
vi.mock('@/lib/env', () => ({
  env: {
    stripeSecretKey: 'sk_test_webhook_fixture',
    stripeWebhookSecret: 'whsec_webhook_fixture',
  },
}))
import { POST } from '@/app/api/paiement/webhook/route'

const ADRESSE = 'webhook-confidentiel@example.invalid'
const SECRET = 'secret-fictif-ne-pas-journaliser'
const DOSSIER = '11111111-1111-4111-8111-111111111111'
const stripe = new Stripe('sk_test_webhook_fixture')
function requete(signatureValide = true, type = 'checkout.session.completed', objet?: unknown) {
  const payload = JSON.stringify({
    id: 'evt_fixture',
    created: 1767225600,
    type,
    data: {
      object: objet ?? {
        id: 'cs_fixture',
        customer_email: ADRESSE,
        payment_status: 'paid',
        mode: 'payment',
        currency: 'eur',
        amount_total: 900,
        metadata: { dossier_id: DOSSIER },
      },
    },
  })
  // Signature locale du vrai SDK ; aucune API Stripe n'est appelee.
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: signatureValide ? 'whsec_webhook_fixture' : 'whsec_autre_fixture',
  })
  return new NextRequest('https://example.invalid/api/paiement/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body: payload,
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  serveur.mockResolvedValue({ rpc })
  rpc.mockResolvedValue({ data: { marque: true, anomalie: false }, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

const remboursement = () =>
  requete(true, 'charge.refunded', {
    id: 'ch_fixture',
    payment_intent: 'pi_fixture',
    amount_refunded: 500,
    currency: 'eur',
  })
test('un remboursement necrit que le contexte verifie chez le fournisseur', async () => {
  retrouver.mockResolvedValueOnce({ reference_session: 'cs_fixture', le_dossier: DOSSIER })
  rpc.mockResolvedValueOnce({ data: true, error: null })
  expect((await POST(remboursement())).status).toBe(200)
  expect(retrouver).toHaveBeenCalledExactlyOnceWith('pi_fixture')
  expect(rpc).toHaveBeenCalledWith(
    'enregistrer_suivi_paiement',
    expect.objectContaining({ reference_session: 'cs_fixture', le_dossier: DOSSIER, montant: 500 }),
  )
})
test('un remboursement exterieur a Cloison necrit aucune ligne', async () => {
  retrouver.mockResolvedValueOnce(null)
  expect((await POST(remboursement())).status).toBe(200)
  expect(serveur).not.toHaveBeenCalled()
})
test('une attribution fournisseur indisponible fait rejouer le remboursement', async () => {
  retrouver.mockRejectedValueOnce(new Error(SECRET))
  expect((await POST(remboursement())).status).toBe(503)
  expect(serveur).not.toHaveBeenCalled()
  verifierConfidentialite()
})
test('un remboursement sans confirmation SQL est rejouable', async () => {
  retrouver.mockResolvedValueOnce({ reference_session: 'cs_fixture', le_dossier: DOSSIER })
  rpc.mockResolvedValueOnce({ data: null, error: null })
  expect((await POST(remboursement())).status).toBe(503)
})
function verifierConfidentialite() {
  const traces = JSON.stringify(vi.mocked(console.error).mock.calls)
  for (const sensible of [ADRESSE, SECRET, DOSSIER, 'cs_fixture'])
    expect(traces).not.toContain(sensible)
}

test('une signature refusee par le vrai SDK ne contacte jamais la base', async () => {
  const reponse = await POST(requete(false))
  expect(reponse.status).toBe(400)
  expect(serveur).not.toHaveBeenCalled()
  expect(rpc).not.toHaveBeenCalled()
  verifierConfidentialite()
})

test('un evenement signe sans paiement concerne est acquitte sans base', async () => {
  const reponse = await POST(requete(true, 'invoice.created'))
  expect(reponse.status).toBe(200)
  expect(await reponse.json()).toEqual({ recu: true })
  expect(serveur).not.toHaveBeenCalled()
})

test('un paiement signe valide appelle le marquage avec les references attendues', async () => {
  const reponse = await POST(requete())
  expect(reponse.status).toBe(200)
  expect(await reponse.json()).toEqual({ recu: true, marque: true })
  expect(rpc).toHaveBeenCalledExactlyOnceWith('enregistrer_paiement_locataire', {
    le_dossier: DOSSIER,
    reference_session: 'cs_fixture',
    reference_paiement: null,
    evenement: 'evt_fixture',
    montant: 900,
    devise: 'eur',
    version_tarif: 'locataire-2026-09-04',
    survenu: '2026-01-01T00:00:00.000Z',
  })
  expect(console.error).not.toHaveBeenCalled()
})

for (const [code, statut, message] of [
  ['23505', 503, '[paiement] webhook a rejouer'],
  ['42501', 503, '[paiement] webhook a rejouer'],
] as const) {
  test(`le refus SQL ${code} preserve la reponse metier sans journaliser details ou paiement`, async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code,
        message: `Erreur fictive concernant ${ADRESSE}`,
        details: `Valeur privee ${SECRET}`,
        hint: 'Ne jamais copier les donnees dans le journal',
      },
    })
    const reponse = await POST(requete())
    expect(reponse.status).toBe(statut)
    expect(await reponse.json()).toEqual({ recu: false })
    verifierConfidentialite()
    expect(console.error).toHaveBeenCalledExactlyOnceWith(message)
  })
}

for (const etape of ['client', 'rpc', 'lecture-corps']) {
  test(`une exception ${etape} rend un 503 controle et permet le rejeu`, async () => {
    const erreur = new Error(`Panne fictive ${ADRESSE} ${SECRET}`)
    const appel = requete()
    if (etape === 'client') serveur.mockRejectedValueOnce(erreur)
    if (etape === 'rpc') rpc.mockRejectedValueOnce(erreur)
    if (etape === 'lecture-corps')
      vi.spyOn(appel.body!, 'getReader').mockImplementationOnce(() => {
        throw erreur
      })
    const reponse = await POST(appel)
    expect(reponse.status).toBe(503)
    expect(await reponse.json()).toEqual({ recu: false })
    verifierConfidentialite()
    expect(console.error).toHaveBeenCalledExactlyOnceWith('[paiement] webhook a rejouer')
    if (etape === 'lecture-corps') expect(serveur).not.toHaveBeenCalled()
    // Le meme evenement signe peut aboutir lors de la prochaine tentative.
    const reprise = await POST(requete())
    expect(reprise.status).toBe(200)
    expect(await reprise.json()).toEqual({ recu: true, marque: true })
  })
}

test('un webhook trop grand est refuse avant signature et SQL meme sans longueur annoncee', async () => {
  const appel = new NextRequest('https://example.invalid/api/paiement/webhook', {
    method: 'POST',
    body: 'x'.repeat(65537),
  })
  expect((await POST(appel)).status).toBe(413)
  expect(serveur).not.toHaveBeenCalled()
})

test('le marquage recoit un signal reseau borne', async () => {
  expect((await POST(requete())).status).toBe(200)
  expect(serveur).toHaveBeenCalledWith(expect.any(AbortSignal))
})

test.each([
  null,
  undefined,
  true,
  { marque: true },
  { marque: 'true', anomalie: false },
  { marque: true, anomalie: false, prive: 'x' },
])('une reponse de registre ambigue %j demande un rejeu', async (data) => {
  rpc.mockResolvedValue({ data, error: null })
  expect((await POST(requete())).status).toBe(503)
})
