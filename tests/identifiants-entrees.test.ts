import { beforeEach, expect, test, vi } from 'vitest'
import type Stripe from 'stripe'
import { NextRequest } from 'next/server'
const d = vi.hoisted(() => ({
  contexte: vi.fn(async () => {
    throw new Error('Contexte sollicite')
  }),
  capacite: vi.fn(async () => {
    throw new Error('Capacite sollicitee')
  }),
  challenge: vi.fn(async () => ({ error: null })),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('@/lib/acces/session', () => ({
  capaciteDepuisCookies: d.capacite,
  clientPorteurDeLien: vi.fn(),
}))
vi.mock('@/lib/acces/agence', () => ({
  utilisateurCourant: async () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  clientAgence: async () => ({ auth: { mfa: { challengeAndVerify: d.challenge } } }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/env', () => ({ env: {} }))
import PageDossier from '@/app/(agence)/espace/dossiers/[id]/page'
import { GET } from '@/app/(agence)/espace/pieces/[id]/route'
import { prendreLeDossier, refuserLeDossier } from '@/lib/agences/action-dossier'
import { retirerUnePiece } from '@/lib/garant/action-depot'
import { verifierSecondFacteur } from '@/lib/agences/action-securite'
import { paiementConfirme } from '@/lib/paiement/stripe'
import { estUuidCanonique } from '@/lib/validation/uuid'
beforeEach(() => vi.clearAllMocks())
test('les UUID canoniques existants restent acceptes sans imposer une version', () => {
  for (const id of [
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-4444-444444444444',
    '0198e234-abcd-7123-8123-123456789abc',
  ])
    expect(estUuidCanonique(id)).toBe(true)
  for (const v of [
    undefined,
    null,
    {},
    [],
    36,
    ' 44444444-4444-4444-4444-444444444444',
    '0198E234-ABCD-7123-8123-123456789ABC',
  ])
    expect(estUuidCanonique(v)).toBe(false)
})
test('une route au format valide conserve le controle de session', async () => {
  await expect(
    PageDossier({ params: Promise.resolve({ id: '44444444-4444-4444-4444-444444444444' }) }),
  ).rejects.toThrow('Contexte sollicite')
  expect(d.contexte).toHaveBeenCalledOnce()
})
test('un facteur valide est transmis avec son code apres authentification', async () => {
  const f = new FormData(),
    id = '11111111-1111-4111-8111-111111111111'
  f.set('facteur', id)
  f.set('code', '123456')
  await expect(verifierSecondFacteur({}, f)).rejects.toThrow('REDIRECT:/espace')
  expect(d.challenge).toHaveBeenCalledExactlyOnceWith({ factorId: id, code: '123456' })
})
test('une confirmation valide conserve la reference de la session', () => {
  const dossierId = '44444444-4444-4444-4444-444444444444'
  const evenement = {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_fictif',
        payment_status: 'paid',
        mode: 'payment',
        currency: 'eur',
        amount_total: 900,
        metadata: { dossier_id: dossierId },
      },
    },
  } as unknown as Stripe.Event
  expect(paiementConfirme(evenement)).toEqual({ dossierId, reference: 'cs_test_fictif' })
})
const invalides = [
  '-'.repeat(36),
  'a'.repeat(36),
  '1234567-12345-1234-1234-123456789abc',
  '11111111-1111-4111-8111-111111111111\n',
]
for (const id of invalides) {
  test(`la page refuse la forme ${JSON.stringify(id)} avant les donnees`, async () => {
    await expect(PageDossier({ params: Promise.resolve({ id }) })).rejects.toThrow('NOT_FOUND')
    expect(d.contexte).not.toHaveBeenCalled()
  })
  test(`la piece refuse la forme ${JSON.stringify(id)} avant les donnees`, async () => {
    await expect(
      GET(new NextRequest('https://example.invalid/espace/pieces/invalide'), {
        params: Promise.resolve({ id }),
      }),
    ).resolves.toMatchObject({ status: 404 })
    expect(d.contexte).not.toHaveBeenCalled()
  })
  test.each([prendreLeDossier, refuserLeDossier])(
    `une decision refuse la forme ${JSON.stringify(id)} avant SQL %#`,
    async (action) => {
      const f = new FormData()
      f.set('dossier', id)
      await expect(action({ statut: 'inactif' }, f)).resolves.toEqual({
        statut: 'erreur',
        message: 'Dossier inconnu.',
      })
      expect(d.contexte).not.toHaveBeenCalled()
    },
  )
  test(`un retrait refuse la forme ${JSON.stringify(id)} avant la capacite`, async () => {
    const f = new FormData()
    f.set('piece', id)
    await expect(retirerUnePiece({ statut: 'inactif' }, f)).resolves.toEqual({
      statut: 'erreur',
      message: 'Piece inconnue.',
    })
    expect(d.capacite).not.toHaveBeenCalled()
  })
  test(`MFA refuse la forme ${JSON.stringify(id)} avant le fournisseur`, async () => {
    const f = new FormData()
    f.set('facteur', id)
    f.set('code', '123456')
    await expect(verifierSecondFacteur({}, f)).resolves.toHaveProperty('erreur')
    expect(d.challenge).not.toHaveBeenCalled()
  })
  test(`la confirmation Stripe ignore la forme ${JSON.stringify(id)}`, () => {
    const evenement = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_fictif',
          payment_status: 'paid',
          mode: 'payment',
          currency: 'eur',
          amount_total: 900,
          metadata: { dossier_id: id },
        },
      },
    } as unknown as Stripe.Event
    expect(paiementConfirme(evenement)).toBeNull()
  })
}
