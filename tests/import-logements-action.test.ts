import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const d = vi.hoisted(() => ({
  contexte: vi.fn(),
  revalider: vi.fn(),
  lire: vi.fn(),
  configure: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
vi.mock('@/lib/langue-espace', () => ({ langueEspace: async () => 'fr' }))
vi.mock('@/lib/logiciels/apimo', () => ({
  apimoConfigure: d.configure,
  lireLocationsApimo: d.lire,
}))
import { importerDepuisApimo, reglerApimo } from '@/lib/logiciels/action'
import { logiciels as texte } from '@/lib/content/logiciels'

const INACTIF = { statut: 'inactif' } as const
const form = (v: Record<string, string> = {}) => {
  const f = new FormData()
  for (const [k, x] of Object.entries(v)) f.set(k, x)
  return f
}
const BIEN = { reference: '7', libelle: 'T2' }
const admin = (role = 'admin') =>
  d.contexte.mockResolvedValue({ etat: 'rattache', role, supabase: { rpc: d.rpc } })

beforeEach(() => {
  admin()
  d.configure.mockReturnValue(true)
  d.lire.mockResolvedValue({ etat: 'ok', biens: [BIEN], ignores: 0 })
  d.rpc.mockImplementation(async (nom: string) =>
    nom === 'reserver_import_logiciel'
      ? { data: '42', error: null }
      : nom === 'importer_logements'
        ? { data: { crees: 1, mis_a_jour: 0 }, error: null }
        : { data: true, error: null },
  )
})
afterEach(() => vi.resetAllMocks())

test('l identifiant est valide avant tout appel, puis confie a la base', async () => {
  expect(await reglerApimo(INACTIF, form({ identifiant: '42/../7' }))).toEqual({
    statut: 'erreur',
    message: texte.erreurs.identifiant,
  })
  expect(d.rpc).not.toHaveBeenCalled()
  expect(await reglerApimo(INACTIF, form({ identifiant: ' 42 ' }))).toEqual({
    statut: 'enregistre',
  })
  expect(d.rpc).toHaveBeenCalledWith('regler_connexion_logiciel', {
    le_logiciel: 'apimo',
    l_identifiant: '42',
  })
})

test.each([
  ['un membre', () => admin('membre')],
  ['une session perdue', () => d.contexte.mockResolvedValue({ etat: 'anonyme' })],
  ['un import non ouvert', () => d.configure.mockReturnValue(false)],
])('%s ne regle ni n importe', async (_nom, preparer) => {
  preparer()
  const refus = { statut: 'erreur', message: texte.erreurs.session }
  expect(await reglerApimo(INACTIF, form({ identifiant: '42' }))).toEqual(refus)
  expect(await importerDepuisApimo(INACTIF, form())).toEqual(refus)
  expect(d.rpc).not.toHaveBeenCalled()
  expect(d.lire).not.toHaveBeenCalled()
})

test('l import lit l identifiant reserve par la base et inscrit les biens lus', async () => {
  expect(await importerDepuisApimo(INACTIF, form({ identifiant: '999' }))).toEqual({
    statut: 'importe',
    crees: 1,
    misAJour: 0,
  })
  expect(d.lire).toHaveBeenCalledWith('42')
  expect(d.rpc).toHaveBeenLastCalledWith('importer_logements', {
    le_logiciel: 'apimo',
    biens: [BIEN],
  })
})

test('sans reservation, l editeur n est pas appele', async () => {
  d.rpc.mockResolvedValue({ data: null, error: null })
  expect(await importerDepuisApimo(INACTIF, form())).toEqual({
    statut: 'erreur',
    message: texte.erreurs.cadence,
  })
  expect(d.lire).not.toHaveBeenCalled()
})

test.each(['refuse', 'limite', 'indisponible', 'reponse_invalide', 'trop_de_biens'] as const)(
  'une lecture %s n inscrit rien',
  async (etat) => {
    d.lire.mockResolvedValue({ etat })
    expect(await importerDepuisApimo(INACTIF, form())).toEqual({
      statut: 'erreur',
      message: texte.erreurs.lecture[etat],
    })
    expect(d.rpc).toHaveBeenCalledTimes(1)
  },
)

test('aucun bien a louer, ou un refus de la base, se disent sans succes', async () => {
  d.lire.mockResolvedValue({ etat: 'ok', biens: [], ignores: 4 })
  expect(await importerDepuisApimo(INACTIF, form())).toEqual({
    statut: 'erreur',
    message: texte.erreurs.aucun,
  })
  d.lire.mockResolvedValue({ etat: 'ok', biens: [BIEN], ignores: 0 })
  d.rpc.mockImplementation(async (nom: string) =>
    nom === 'reserver_import_logiciel' ? { data: '42', error: null } : { data: null, error: null },
  )
  expect(await importerDepuisApimo(INACTIF, form())).toEqual({
    statut: 'erreur',
    message: texte.erreurs.general,
  })
})
