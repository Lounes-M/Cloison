import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const d = vi.hoisted(() => ({
  contexte: vi.fn(),
  revalider: vi.fn(),
  ouvrir: vi.fn(),
  livrer: vi.fn(),
  appels: [] as { table: string; op: string; valeurs?: unknown; filtres: unknown[][] }[],
  logement: { id: '22222222-2222-4222-8222-222222222222', loyer_cents: 90000 } as unknown,
  erreur: null as unknown,
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
vi.mock('@/lib/acces/session', () => ({ ouvrirDossierAvecLien: d.ouvrir }))
vi.mock('@/lib/courriels/livraison-liens', () => ({ reprendreLivraisonLiens: d.livrer }))
vi.mock('@/lib/courriels/notifications', () => ({
  prevenirSiLeStatutAChange: vi.fn(),
  statutActuel: vi.fn(),
}))
import {
  archiverUnLogement,
  creerUnLogement,
  rattacherAuLogement,
} from '@/lib/agences/action-logements'
import { ouvrirUnDossier } from '@/lib/agences/action-dossier'
import { logements as texte } from '@/lib/content/logements'

const DOSSIER = '11111111-1111-4111-8111-111111111111'
const LOGEMENT = '22222222-2222-4222-8222-222222222222'

function client() {
  return {
    from: (table: string) => {
      const appel = (op: string, valeurs?: unknown) => {
        const a = { table, op, valeurs, filtres: [] as unknown[][] }
        d.appels.push(a)
        const chaine = {
          eq: (...x: unknown[]) => (a.filtres.push(['eq', ...x]), chaine),
          select: () => chaine,
          maybeSingle: async () =>
            op === 'select'
              ? { data: d.logement, error: null }
              : { data: d.erreur ? null : { id: 'x' }, error: d.erreur },
          then: (r: (v: unknown) => unknown) => r({ error: d.erreur }),
        }
        return chaine
      }
      return {
        insert: (v: unknown) => appel('insert', v),
        update: (v: unknown) => appel('update', v),
        select: () => appel('select'),
      }
    },
  }
}

const form = (v: Record<string, string>) => {
  const f = new FormData()
  for (const [k, x] of Object.entries(v)) f.set(k, x)
  return f
}

beforeEach(() => {
  d.appels.length = 0
  d.erreur = null
  d.logement = { id: LOGEMENT, loyer_cents: 90000 }
  d.contexte.mockResolvedValue({
    etat: 'rattache',
    agence: { id: 'agence-1', statut: 'verifiee' },
    supabase: client(),
  })
  d.ouvrir.mockResolvedValue({ dossierId: DOSSIER })
})
afterEach(() => vi.resetAllMocks())

test("creer un logement l'inscrit pour l'agence courante", async () => {
  expect(
    await creerUnLogement({ statut: 'inactif' }, form({ libelle: '  T2 Gerland ', loyer: '780' })),
  ).toEqual({ statut: 'enregistre' })
  expect(d.appels).toEqual([
    {
      table: 'logements',
      op: 'insert',
      valeurs: { agence_id: 'agence-1', libelle: 'T2 Gerland', loyer_cents: 78000 },
      filtres: [],
    },
  ])
})

test.each([
  [{ libelle: '' }, texte.erreurs.libelle],
  [{ libelle: 'x'.repeat(121) }, texte.erreurs.libelle],
  [{ libelle: 'T3', loyer: 'cher' }, texte.erreurs.loyer],
])('un logement mal saisi ne touche pas la base', async (valeurs, message) => {
  expect(await creerUnLogement({ statut: 'inactif' }, form(valeurs))).toEqual({
    statut: 'erreur',
    message,
  })
  expect(d.appels).toEqual([])
})

test('archiver et rattacher passent par les droits de l agence', async () => {
  await archiverUnLogement(form({ logement: LOGEMENT, archive: 'oui' }))
  await archiverUnLogement(form({ logement: 'pas-un-uuid', archive: 'oui' }))
  expect(
    await rattacherAuLogement({ statut: 'inactif' }, form({ dossier: DOSSIER, logement: '' })),
  ).toEqual({ statut: 'enregistre' })
  expect(d.appels.map((a) => [a.table, a.valeurs])).toEqual([
    ['logements', { archive: true }],
    ['dossiers', { logement_id: null }],
  ])
  d.erreur = { message: 'Logement inconnu' }
  expect(
    await rattacherAuLogement(
      { statut: 'inactif' },
      form({ dossier: DOSSIER, logement: LOGEMENT }),
    ),
  ).toEqual({ statut: 'erreur', message: texte.erreurs.general })
})

test('ouvrir depuis un logement rattache le dossier et reprend son loyer', async () => {
  expect(
    await ouvrirUnDossier(
      { statut: 'inactif' },
      form({ courriel: 'loc@example.invalid', logement: LOGEMENT }),
    ),
  ).toEqual({ statut: 'ouvert', email: 'loc@example.invalid' })
  expect(d.appels.at(-1)).toMatchObject({
    table: 'dossiers',
    valeurs: { loyer_cents: 90000, logement_id: LOGEMENT },
  })
  await ouvrirUnDossier(
    { statut: 'inactif' },
    form({ courriel: 'loc@example.invalid', logement: LOGEMENT, loyer: '800' }),
  )
  expect(d.appels.at(-1)).toMatchObject({ valeurs: { loyer_cents: 80000, logement_id: LOGEMENT } })
})

test("un logement d'une autre agence n'ouvre rien", async () => {
  d.logement = null
  expect(
    await ouvrirUnDossier(
      { statut: 'inactif' },
      form({ courriel: 'loc@example.invalid', logement: LOGEMENT }),
    ),
  ).toMatchObject({ statut: 'erreur' })
  expect(d.ouvrir).not.toHaveBeenCalled()
})
