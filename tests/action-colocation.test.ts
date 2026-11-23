import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const d = vi.hoisted(() => ({
  contexte: vi.fn(),
  revalider: vi.fn(),
  ouvrir: vi.fn(),
  livrer: vi.fn(),
  langue: vi.fn(),
  appels: [] as { table: string; op: string; valeurs?: unknown; filtres: unknown[][] }[],
  colocation: null as unknown,
  membres: [] as unknown[],
  rattachementRefuse: [] as string[],
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
vi.mock('@/lib/acces/session', () => ({ ouvrirDossierAvecLien: d.ouvrir }))
vi.mock('@/lib/courriels/livraison-liens', () => ({ reprendreLivraisonLiens: d.livrer }))
vi.mock('@/lib/langue-preferee', () => ({ reglerLangueDossier: d.langue }))
vi.mock('@/lib/langue-espace', () => ({ langueEspace: async () => 'fr' }))

import { ouvrirUneColocation } from '@/lib/agences/action-colocation'
import { lireAdresses, repartirLoyer } from '@/lib/agences/colocation'
import { colocation as t } from '@/lib/content/colocation'

const COLOC = '22222222-2222-4222-8222-222222222222'
const LOGEMENT = '33333333-3333-4333-8333-333333333333'

/** Un client Supabase qui note chaque appel et rend ce que le test a prepare. */
function client() {
  return {
    from: (table: string) => {
      const appel = {
        table,
        op: 'select',
        valeurs: undefined as unknown,
        filtres: [] as unknown[][],
      }
      d.appels.push(appel)
      const resultat = () => {
        if (table === 'colocations' && appel.op === 'insert')
          return { data: { id: COLOC }, error: null }
        if (table === 'colocations' && appel.op === 'select')
          return { data: d.colocation, error: null }
        if (table === 'dossiers' && appel.op === 'select') return { data: d.membres, error: null }
        if (table === 'dossiers' && appel.op === 'update') {
          const id = String(appel.filtres.find((f) => f[1] === 'id')?.[2])
          return d.rattachementRefuse.includes(id)
            ? { data: [], error: null }
            : { data: [{ id }], error: null }
        }
        return { data: null, error: null }
      }
      const chaine: Record<string, unknown> = {
        insert: (v: unknown) => ((appel.op = 'insert'), (appel.valeurs = v), chaine),
        update: (v: unknown) => ((appel.op = 'update'), (appel.valeurs = v), chaine),
        delete: () => ((appel.op = 'delete'), chaine),
        select: () => chaine,
        eq: (...a: unknown[]) => (appel.filtres.push(['eq', ...a]), chaine),
        limit: () => chaine,
        maybeSingle: async () => resultat(),
        then: (r: (v: unknown) => unknown) => r(resultat()),
      }
      return chaine
    },
  }
}

function form(valeurs: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v)
  return f
}
const ecritures = (table: string, op: string) =>
  d.appels.filter((a) => a.table === table && a.op === op)

beforeEach(() => {
  d.appels.length = 0
  d.colocation = null
  d.membres = []
  d.rattachementRefuse = []
  d.contexte.mockResolvedValue({
    etat: 'rattache',
    agence: { id: 'agence', statut: 'verifiee' },
    supabase: client(),
  })
  d.ouvrir.mockImplementation(async (courriel: string) => ({ dossierId: `dossier-${courriel}` }))
})
afterEach(() => vi.resetAllMocks())

test('les adresses se lisent une par ligne, sans doublon, de deux a huit', () => {
  expect(lireAdresses(' A@x.fr \n b@x.fr; c@x.fr', 2)).toEqual({
    ok: true,
    adresses: ['a@x.fr', 'b@x.fr', 'c@x.fr'],
  })
  expect(lireAdresses('a@x.fr', 2)).toEqual({ ok: false, motif: 'adresses' })
  expect(lireAdresses('a@x.fr\npas-une-adresse', 2)).toEqual({ ok: false, motif: 'adresses' })
  expect(lireAdresses('a@x.fr\nA@x.fr', 2)).toEqual({ ok: false, motif: 'doublon' })
  expect(lireAdresses(Array.from({ length: 9 }, (_, i) => `c${i}@x.fr`).join('\n'), 2)).toEqual({
    ok: false,
    motif: 'trop',
  })
})

test('les parts font exactement le total ; un bail solidaire porte le loyer entier', () => {
  expect(repartirLoyer(120000, 'part', 3)).toEqual([40000, 40000, 40000])
  expect(repartirLoyer(100000, 'part', 3)).toEqual([33334, 33333, 33333])
  expect(repartirLoyer(100000, 'loyer_entier', 3)).toEqual([100000, 100000, 100000])
})

test.each([
  [{ courriels: 'a@x.fr', loyerTotal: '1200' }, t.erreurs.adresses],
  [{ courriels: 'a@x.fr\na@x.fr', loyerTotal: '1200' }, t.erreurs.doublon],
  [{ courriels: 'a@x.fr\nb@x.fr', loyerTotal: 'abc' }, t.erreurs.loyer],
  [{ courriels: 'a@x.fr\nb@x.fr', loyerTotal: '' }, t.erreurs.loyer],
  [{ courriels: 'a@x.fr\nb@x.fr', loyerTotal: '1200', logement: 'x' }, t.erreurs.impossible],
])('une saisie refusee n ouvre rien (%#)', async (saisie, message) => {
  const etat = await ouvrirUneColocation({ statut: 'inactif' }, form(saisie))
  expect(etat).toMatchObject({ statut: 'erreur', message })
  expect(d.ouvrir).not.toHaveBeenCalled()
  expect(d.appels).toEqual([])
})

test('une agence non verifiee n ouvre pas de colocation', async () => {
  d.contexte.mockResolvedValue({
    etat: 'rattache',
    agence: { statut: 'decouverte' },
    supabase: client(),
  })
  const etat = await ouvrirUneColocation(
    { statut: 'inactif' },
    form({ courriels: 'a@x.fr\nb@x.fr', loyerTotal: '1200' }),
  )
  expect(etat).toMatchObject({ statut: 'erreur', message: t.erreurs.nonVerifiee })
  expect(d.ouvrir).not.toHaveBeenCalled()
})

test('une colocation neuve ouvre un dossier par colocataire, a parts egales', async () => {
  const etat = await ouvrirUneColocation(
    { statut: 'inactif' },
    form({ courriels: 'a@x.fr\nb@x.fr\nc@x.fr', loyerTotal: '1000', logement: LOGEMENT }),
  )
  expect(etat).toEqual({ statut: 'ouverte', colocation: COLOC, ouverts: 3, echecs: [] })
  expect(ecritures('colocations', 'insert')[0]!.valeurs).toEqual({
    agence_id: 'agence',
    logement_id: LOGEMENT,
    loyer_total_cents: 100000,
    etendue: 'part',
  })
  expect(ecritures('dossiers', 'update').map((e) => e.valeurs)).toEqual([
    { colocation_id: COLOC, loyer_cents: 33334, logement_id: LOGEMENT },
    { colocation_id: COLOC, loyer_cents: 33333, logement_id: LOGEMENT },
    { colocation_id: COLOC, loyer_cents: 33333, logement_id: LOGEMENT },
  ])
  expect(d.livrer).toHaveBeenCalledTimes(3)
  expect(d.revalider).toHaveBeenCalledWith(`/espace/colocations/${COLOC}`)
})

test('un bail solidaire porte le loyer entier sur chaque dossier', async () => {
  await ouvrirUneColocation(
    { statut: 'inactif' },
    form({ courriels: 'a@x.fr\nb@x.fr', loyerTotal: '1000', etendue: 'loyer_entier' }),
  )
  expect(ecritures('dossiers', 'update').map((e) => e.valeurs)).toEqual([
    { colocation_id: COLOC, loyer_cents: 100000 },
    { colocation_id: COLOC, loyer_cents: 100000 },
  ])
})

test('un colocataire qui echoue est signale, les autres restent ouverts', async () => {
  d.ouvrir.mockImplementation(async (courriel: string) =>
    courriel === 'b@x.fr' ? null : { dossierId: `dossier-${courriel}` },
  )
  d.rattachementRefuse = ['dossier-c@x.fr']
  const etat = await ouvrirUneColocation(
    { statut: 'inactif' },
    form({ courriels: 'a@x.fr\nb@x.fr\nc@x.fr', loyerTotal: '900' }),
  )
  expect(etat).toEqual({
    statut: 'ouverte',
    colocation: COLOC,
    ouverts: 1,
    echecs: ['b@x.fr', 'c@x.fr'],
  })
  // Le dossier ouvert hors colocation existe : son locataire recoit son lien.
  expect(d.livrer).toHaveBeenCalledWith('dossier-c@x.fr')
})

test('aucun dossier ouvert : la colocation neuve est supprimee', async () => {
  d.ouvrir.mockResolvedValue(null)
  const etat = await ouvrirUneColocation(
    { statut: 'inactif' },
    form({ courriels: 'a@x.fr\nb@x.fr', loyerTotal: '900' }),
  )
  expect(etat).toMatchObject({ statut: 'erreur', message: t.erreurs.impossible })
  expect(ecritures('colocations', 'delete')).toHaveLength(1)
})

test('ajouter un colocataire : une adresse suffit, sa part est egale, le reste vient de la colocation', async () => {
  d.colocation = { id: COLOC, logement_id: LOGEMENT, loyer_total_cents: 120000, etendue: 'part' }
  const dans = new Date(Date.now() + 86400000).toISOString()
  d.membres = [
    { email_locataire: 'a@x.fr', email_garant: 'ga@x.fr', statut: 'complet', expire_le: dans },
    { email_locataire: 'b@x.fr', email_garant: null, statut: 'ouvert', expire_le: dans },
    { email_locataire: 'parti@x.fr', email_garant: null, statut: 'refuse', expire_le: dans },
  ]
  const etat = await ouvrirUneColocation(
    { statut: 'inactif' },
    form({ colocation: COLOC, courriels: 'parti@x.fr' }),
  )
  expect(etat).toEqual({ statut: 'ouverte', colocation: COLOC, ouverts: 1, echecs: [] })
  expect(ecritures('colocations', 'insert')).toEqual([])
  expect(ecritures('dossiers', 'update')[0]!.valeurs).toEqual({
    colocation_id: COLOC,
    loyer_cents: 40000,
    logement_id: LOGEMENT,
  })
})

test.each(['a@x.fr', 'ga@x.fr'])(
  'ajouter une adresse deja presente (%s) est refuse sans rien ouvrir',
  async (courriel) => {
    d.colocation = { id: COLOC, logement_id: null, loyer_total_cents: 120000, etendue: 'part' }
    d.membres = [
      {
        email_locataire: 'a@x.fr',
        email_garant: 'ga@x.fr',
        statut: 'complet',
        expire_le: new Date(Date.now() + 86400000).toISOString(),
      },
    ]
    const etat = await ouvrirUneColocation(
      { statut: 'inactif' },
      form({ colocation: COLOC, courriels: courriel }),
    )
    expect(etat).toMatchObject({ statut: 'erreur', message: t.erreurs.dejaPresente })
    expect(d.ouvrir).not.toHaveBeenCalled()
  },
)

test('la colocation d une autre agence n existe pas : rien ne s ouvre', async () => {
  const etat = await ouvrirUneColocation(
    { statut: 'inactif' },
    form({ colocation: COLOC, courriels: 'z@x.fr' }),
  )
  expect(etat).toMatchObject({ statut: 'erreur', message: t.erreurs.impossible })
  expect(d.ouvrir).not.toHaveBeenCalled()
})
