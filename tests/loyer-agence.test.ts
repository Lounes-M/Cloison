import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const d = vi.hoisted(() => ({
  contexte: vi.fn(),
  revalider: vi.fn(),
  ouvrir: vi.fn(),
  livrer: vi.fn(),
  prevenir: vi.fn(),
  statut: vi.fn(),
  ecritures: [] as { valeurs: unknown; filtres: unknown[][] }[],
  resultat: { data: { id: 'x' } as unknown, error: null as unknown },
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
vi.mock('@/lib/acces/session', () => ({ ouvrirDossierAvecLien: d.ouvrir }))
vi.mock('@/lib/courriels/livraison-liens', () => ({ reprendreLivraisonLiens: d.livrer }))
vi.mock('@/lib/courriels/notifications', () => ({
  prevenirSiLeStatutAChange: d.prevenir,
  statutActuel: d.statut,
}))
import { fixerLeLoyer } from '@/lib/agences/action-loyer'
import { ouvrirUnDossier } from '@/lib/agences/action-dossier'
import { loyerAgence, tableau } from '@/lib/content/espace'

const id = '11111111-1111-4111-8111-111111111111'

/** Un client Supabase qui note chaque ecriture et ses filtres. */
function client() {
  return {
    from: () => ({
      update: (valeurs: unknown) => {
        const ecriture = { valeurs, filtres: [] as unknown[][] }
        d.ecritures.push(ecriture)
        const chaine = {
          eq: (...a: unknown[]) => (ecriture.filtres.push(['eq', ...a]), chaine),
          is: (...a: unknown[]) => (ecriture.filtres.push(['is', ...a]), chaine),
          in: (...a: unknown[]) => (ecriture.filtres.push(['in', ...a]), chaine),
          select: () => chaine,
          maybeSingle: async () => d.resultat,
          then: (r: (v: unknown) => unknown) => r({ error: d.resultat.error }),
        }
        return chaine
      },
    }),
  }
}

function form(valeurs: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v)
  return f
}

beforeEach(() => {
  d.ecritures.length = 0
  d.resultat = { data: { id }, error: null }
  d.contexte.mockResolvedValue({
    etat: 'rattache',
    agence: { statut: 'verifiee' },
    supabase: client(),
  })
  d.ouvrir.mockResolvedValue({ dossierId: id })
  d.statut.mockResolvedValue('ouvert')
})
afterEach(() => vi.resetAllMocks())

test.each(['abc', '0', '-5', '12,345'])(
  'un loyer illisible (%s) ne touche pas la base',
  async (loyer) => {
    expect(await fixerLeLoyer({ statut: 'inactif' }, form({ dossier: id, loyer }))).toEqual({
      statut: 'erreur',
      message: loyerAgence.invalide,
      valeur: loyer,
    })
    expect(d.ecritures).toEqual([])
  },
)

test("l'agence fixe le loyer d'un dossier principal encore ouvert", async () => {
  expect(await fixerLeLoyer({ statut: 'inactif' }, form({ dossier: id, loyer: '850,50' }))).toEqual(
    { statut: 'enregistre' },
  )
  expect(d.ecritures).toEqual([
    {
      valeurs: { loyer_cents: 85050 },
      filtres: [
        ['eq', 'id', id],
        ['is', 'dossier_principal', null],
        ['in', 'statut', ['ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant']],
      ],
    },
  ])
  expect(d.prevenir).toHaveBeenCalledWith(expect.anything(), id, 'ouvert')
  expect(d.revalider).toHaveBeenCalledWith(`/espace/dossiers/${id}`)
})

test('un loyer fige ou refuse par la base se dit sans rien prevenir', async () => {
  d.resultat = { data: null, error: { message: 'Loyer fige' } }
  expect(await fixerLeLoyer({ statut: 'inactif' }, form({ dossier: id, loyer: '900' }))).toEqual({
    statut: 'erreur',
    message: loyerAgence.erreur,
    valeur: '900',
  })
  expect(d.prevenir).not.toHaveBeenCalled()
})

test("a l'ouverture, le loyer est facultatif et enregistre s'il est donne", async () => {
  const ouvrir = (v: Record<string, string>) => ouvrirUnDossier({ statut: 'inactif' }, form(v))
  expect(await ouvrir({ courriel: 'loc@example.invalid' })).toEqual({
    statut: 'ouvert',
    email: 'loc@example.invalid',
  })
  expect(d.ecritures).toEqual([])
  expect(await ouvrir({ courriel: 'loc@example.invalid', loyer: '1 200' })).toMatchObject({
    statut: 'ouvert',
  })
  expect(d.ecritures).toEqual([{ valeurs: { loyer_cents: 120000 }, filtres: [['eq', 'id', id]] }])
  expect(d.livrer).toHaveBeenCalledTimes(2)
})

test("un loyer illisible a l'ouverture n'ouvre rien", async () => {
  expect(
    await ouvrirUnDossier(
      { statut: 'inactif' },
      form({ courriel: 'loc@example.invalid', loyer: 'beaucoup' }),
    ),
  ).toEqual({
    statut: 'erreur',
    message: tableau.nouveauLoyerInvalide,
    valeur: 'loc@example.invalid',
    loyer: 'beaucoup',
  })
  expect(d.ouvrir).not.toHaveBeenCalled()
})

test("un loyer refuse apres l'ouverture ne defait pas le dossier", async () => {
  d.resultat = { data: null, error: { message: 'non' } }
  expect(
    await ouvrirUnDossier(
      { statut: 'inactif' },
      form({ courriel: 'loc@example.invalid', loyer: '700' }),
    ),
  ).toEqual({ statut: 'ouvert', email: 'loc@example.invalid' })
  expect(d.livrer).toHaveBeenCalledWith(id)
})
