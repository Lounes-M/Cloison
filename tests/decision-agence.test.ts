import { afterEach, beforeEach, expect, test, vi } from 'vitest'

/**
 * Prendre et refuser : deux gestes que l'agence ne fait pas par megarde.
 *
 * Le refus est definitif, il exige une confirmation. Prendre fige la mention
 * du garant : sans mention ni plafond, l'agence le sait et le confirme.
 */
const d = vi.hoisted(() => ({
  contexte: vi.fn(),
  prevenir: vi.fn(),
  dossier: null as unknown,
  membres: [] as { id: string }[],
  engagements: [] as unknown[],
  touchees: [] as { id: string }[],
  ecritures: [] as unknown[],
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/courriels/notifications', () => ({ prevenirSiLeStatutAChange: d.prevenir }))
vi.mock('@/lib/courriels/livraison-liens', () => ({ reprendreLivraisonLiens: vi.fn() }))
vi.mock('@/lib/acces/session', () => ({ ouvrirDossierAvecLien: vi.fn() }))
vi.mock('@/lib/langue-preferee', () => ({ reglerLangueDossier: vi.fn() }))
vi.mock('@/lib/langue-espace', () => ({
  langueEspace: async () => 'fr',
  langueAction: async () => 'fr',
}))
import { prendreLeDossier, refuserLeDossier } from '@/lib/agences/action-dossier'
import { dossier as texte } from '@/lib/content/espace'

const ID = '11111111-1111-4111-8111-111111111111'
const SECOND = '22222222-2222-4222-8222-222222222222'

function client() {
  return {
    rpc: async () => ({ error: null }),
    from: (table: string) => {
      let ecriture: unknown = null
      const chaine = {
        select: () => chaine,
        eq: () => chaine,
        in: () => chaine,
        or: () => chaine,
        update: (valeurs: unknown) => {
          ecriture = valeurs
          d.ecritures.push(valeurs)
          return chaine
        },
        maybeSingle: async () => ({ data: d.dossier, error: null }),
        then: (r: (v: unknown) => unknown) =>
          r({
            data: ecriture ? d.touchees : table === 'engagements' ? d.engagements : d.membres,
            error: null,
          }),
      }
      return chaine
    },
  }
}
const form = (v: Record<string, string>) => {
  const f = new FormData()
  for (const [k, x] of Object.entries(v)) f.set(k, x)
  return f
}
const complet = (dossier_id: string) => ({
  dossier_id,
  mention_saisie_le: '2026-11-01T10:00:00Z',
  montant_max_cents: 1200000,
})

beforeEach(() => {
  d.dossier = { id: ID, dossier_principal: null, demonstration: false }
  d.membres = [{ id: ID }]
  d.engagements = [complet(ID)]
  d.touchees = [{ id: ID }]
  d.ecritures.length = 0
  d.contexte.mockResolvedValue({ etat: 'rattache', agence: { id: 'a' }, supabase: client() })
})
afterEach(() => vi.clearAllMocks())

test('un refus sans confirmation n ecrit rien', async () => {
  expect(await refuserLeDossier({ statut: 'inactif' }, form({ dossier: ID }))).toEqual({
    statut: 'erreur',
    message: texte.refuserConfirmationRequise,
  })
  expect(d.ecritures).toEqual([])
  expect(d.prevenir).not.toHaveBeenCalled()
})

test('un refus confirme part et previent', async () => {
  expect(
    await refuserLeDossier({ statut: 'inactif' }, form({ dossier: ID, confirme: 'on' })),
  ).toEqual({ statut: 'inactif' })
  expect(d.ecritures).toEqual([{ statut: 'refuse' }])
  expect(d.prevenir).toHaveBeenCalledOnce()
})

test('un dossier dont la mention est ecrite se prend sans autre question', async () => {
  expect(await prendreLeDossier({ statut: 'inactif' }, form({ dossier: ID }))).toEqual({
    statut: 'inactif',
  })
  expect(d.ecritures).toEqual([{ statut: 'transmis' }])
})

test.each([
  ['sans engagement', []],
  ['sans mention', [{ ...complet(ID), mention_saisie_le: null }]],
  ['sans plafond', [{ ...complet(ID), montant_max_cents: null }]],
])('un dossier %s ne se prend qu avec la confirmation de l agence', async (_nom, engagements) => {
  d.engagements = engagements
  expect(await prendreLeDossier({ statut: 'inactif' }, form({ dossier: ID }))).toEqual({
    statut: 'erreur',
    message: texte.prendreSansActeRequis,
  })
  expect(d.ecritures).toEqual([])
  expect(
    await prendreLeDossier({ statut: 'inactif' }, form({ dossier: ID, sansActe: 'on' })),
  ).toEqual({ statut: 'inactif' })
  expect(d.ecritures).toEqual([{ statut: 'transmis' }])
})

test('la mention manquante du second garant compte aussi', async () => {
  d.membres = [{ id: ID }, { id: SECOND }]
  expect(await prendreLeDossier({ statut: 'inactif' }, form({ dossier: ID }))).toEqual({
    statut: 'erreur',
    message: texte.prendreSansActeRequis,
  })
  d.engagements = [complet(ID), complet(SECOND)]
  expect(await prendreLeDossier({ statut: 'inactif' }, form({ dossier: ID }))).toEqual({
    statut: 'inactif',
  })
})

test('une demonstration se prend sans mention', async () => {
  d.dossier = { id: ID, dossier_principal: null, demonstration: true }
  d.engagements = []
  expect(await prendreLeDossier({ statut: 'inactif' }, form({ dossier: ID }))).toEqual({
    statut: 'inactif',
  })
})
