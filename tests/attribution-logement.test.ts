import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const d = vi.hoisted(() => ({
  contexte: vi.fn(),
  revalider: vi.fn(),
  prevenir: vi.fn(),
  appels: [] as { table: string; op: string; valeurs?: unknown; filtres: unknown[][] }[],
  candidat: { id: 'x' } as unknown,
  archive: { id: 'x' } as unknown,
  refuses: [] as { id: string }[] | null,
  erreurRefus: null as unknown,
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
vi.mock('@/lib/courriels/notifications', () => ({ prevenirSiLeStatutAChange: d.prevenir }))
import { attribuerLeLogement } from '@/lib/agences/action-logements'
import { logements as texte } from '@/lib/content/logements'

const LOGEMENT = '22222222-2222-4222-8222-222222222222'
const RETENU = '11111111-1111-4111-8111-111111111111'
const AUTRE = '33333333-3333-4333-8333-333333333333'
const AUTRE2 = '44444444-4444-4444-8444-444444444444'

function client() {
  return {
    from: (table: string) => {
      const appel = (op: string, valeurs?: unknown) => {
        const a = { table, op, valeurs, filtres: [] as unknown[][] }
        d.appels.push(a)
        const chaine = {
          eq: (...x: unknown[]) => (a.filtres.push(['eq', ...x]), chaine),
          neq: (...x: unknown[]) => (a.filtres.push(['neq', ...x]), chaine),
          in: (...x: unknown[]) => (a.filtres.push(['in', ...x]), chaine),
          select: () => chaine,
          maybeSingle: async () => ({
            data: table === 'logements' ? d.archive : d.candidat,
            error: null,
          }),
          then: (r: (v: unknown) => unknown) => r({ data: d.refuses, error: d.erreurRefus }),
        }
        return chaine
      }
      return {
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
const valide = () => form({ logement: LOGEMENT, dossier: RETENU, confirme: 'oui' })

beforeEach(() => {
  d.appels.length = 0
  d.candidat = { id: RETENU }
  d.archive = { id: LOGEMENT }
  d.refuses = [{ id: AUTRE }, { id: AUTRE2 }]
  d.erreurRefus = null
  d.contexte.mockResolvedValue({ etat: 'rattache', agence: { id: 'a' }, supabase: client() })
})
afterEach(() => vi.resetAllMocks())

test('attribuer archive le logement puis refuse et previent les autres candidats', async () => {
  expect(await attribuerLeLogement({ statut: 'inactif' }, valide())).toEqual({
    statut: 'attribue',
    refuses: 2,
  })
  expect(d.appels).toEqual([
    {
      table: 'dossiers',
      op: 'select',
      valeurs: undefined,
      filtres: [
        ['eq', 'id', RETENU],
        ['eq', 'logement_id', LOGEMENT],
        ['in', 'statut', ['transmis', 'signe']],
      ],
    },
    {
      table: 'logements',
      op: 'update',
      valeurs: { archive: true },
      filtres: [['eq', 'id', LOGEMENT]],
    },
    {
      table: 'dossiers',
      op: 'update',
      valeurs: { statut: 'refuse' },
      filtres: [
        ['eq', 'logement_id', LOGEMENT],
        ['neq', 'id', RETENU],
        ['in', 'statut', ['complet', 'garant_insuffisant', 'transmis']],
      ],
    },
  ])
  expect(d.prevenir.mock.calls.map((c) => c[1])).toEqual([AUTRE, AUTRE2])
})

test('sans confirmation, rien ne part', async () => {
  const f = valide()
  f.delete('confirme')
  expect(await attribuerLeLogement({ statut: 'inactif' }, f)).toEqual({
    statut: 'erreur',
    message: texte.attribution.erreurs.confirmation,
  })
  expect(d.contexte).not.toHaveBeenCalled()
})

test('un candidat non pris, ou d un autre logement, est refuse sans rien ecrire', async () => {
  d.candidat = null
  expect(await attribuerLeLogement({ statut: 'inactif' }, valide())).toEqual({
    statut: 'erreur',
    message: texte.attribution.erreurs.candidat,
  })
  expect(d.appels.map((a) => a.op)).toEqual(['select'])
  expect(d.prevenir).not.toHaveBeenCalled()
})

test('un logement que l agence ne voit pas n est pas attribue', async () => {
  d.archive = null
  expect(await attribuerLeLogement({ statut: 'inactif' }, valide())).toEqual({
    statut: 'erreur',
    message: texte.erreurs.general,
  })
  expect(d.appels.map((a) => a.op)).toEqual(['select', 'update'])
})

test('un refus groupe en echec le dit, sans prevenir personne', async () => {
  d.refuses = null
  d.erreurRefus = { message: 'x' }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(await attribuerLeLogement({ statut: 'inactif' }, valide())).toEqual({
    statut: 'erreur',
    message: texte.attribution.erreurs.refus,
  })
  expect(d.prevenir).not.toHaveBeenCalled()
})

test('des identifiants invalides sont refuses avant toute lecture', async () => {
  expect(
    await attribuerLeLogement(
      { statut: 'inactif' },
      form({ logement: 'x', dossier: RETENU, confirme: 'oui' }),
    ),
  ).toEqual({ statut: 'erreur', message: texte.attribution.erreurs.candidat })
  expect(d.contexte).not.toHaveBeenCalled()
})

test('les textes de succes s accordent au nombre de candidats prevenus', () => {
  expect(texte.attribution.succes(0)).toContain('Aucun autre candidat')
  expect(texte.attribution.succes(1)).toContain('Un autre candidat a été prévenu')
  expect(texte.attribution.succes(3)).toContain('3 autres candidats ont été prévenus')
})
