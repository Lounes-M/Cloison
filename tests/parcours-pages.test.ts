import { beforeEach, describe, expect, test, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
import { FormulaireGarant } from '@/components/forms/FormulaireGarant'
import PageLocataire from '@/app/(porteur)/locataire/page'
import PageGarant from '@/app/(porteur)/garant/page'
import PageEspace from '@/app/(agence)/espace/page'
import PageDossier from '@/app/(agence)/espace/dossiers/[id]/page'

const doublures = vi.hoisted(() => ({
  capacite: vi.fn(),
  client: vi.fn(),
  contexte: vi.fn(),
}))
vi.mock('@/lib/acces/session', () => ({
  capaciteDepuisCookies: doublures.capacite,
  clientPorteurDeLien: doublures.client,
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: doublures.contexte }))
vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    throw new Error(`redirection:${destination}`)
  },
  notFound: () => {
    throw new Error('introuvable')
  },
}))

const ID = '44444444-4444-4444-4444-444444444444'
type Reponse = { data: unknown; error: null | { message: string } }
let reponses: Record<string, Reponse>
let requetes: string[]

function client() {
  return {
    from(table: string) {
      requetes.push(table)
      const chaine = {
        select: () => chaine,
        eq: () => chaine,
        order: () => chaine,
        limit: () => chaine,
        maybeSingle: () => chaine,
        then: (resolve: (reponse: Reponse) => unknown) =>
          Promise.resolve(reponses[table]!).then(resolve),
      }
      return chaine
    },
    rpc: vi.fn(async () => ({ data: [], error: null })),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requetes = []
  reponses = {
    dossiers: {
      data: {
        id: ID,
        reference: 'TEST',
        statut: 'ouvert',
        expire_le: '2026-12-01',
        cree_le: '2026-09-01',
        email_locataire: 'locataire@example.test',
      },
      error: null,
    },
    engagements: { data: null, error: null },
    pieces: { data: [], error: null },
    journal_acces: { data: [], error: null },
  }
  doublures.capacite.mockResolvedValue({
    jeton: 'jeton-fictif',
    capacite: { partie: 'garant', dossierId: ID },
  })
  doublures.client.mockImplementation(client)
  doublures.contexte.mockImplementation(async () => ({
    etat: 'rattache',
    agence: { nom: 'Essai', statut: 'verifiee', seuilRatio: 3 },
    role: 'admin',
    email: 'agence@example.test',
    supabase: client(),
  }))
})

const locataire = () => PageLocataire({ searchParams: Promise.resolve({}) })
const dossier = () => PageDossier({ params: Promise.resolve({ id: ID }) })

function formulaireGarant(noeud: ReactNode): Record<string, unknown> | undefined {
  if (Array.isArray(noeud)) return noeud.map(formulaireGarant).find(Boolean)
  if (!isValidElement<{ children?: ReactNode }>(noeud)) return undefined
  if (noeud.type === FormulaireGarant) return noeud.props
  return formulaireGarant(noeud.props.children)
}

test.each(['transmis', 'refuse', 'signe'])(
  'le lien du garant reste renouvelable apres %s sans changement de personne',
  async (statut) => {
    doublures.capacite.mockResolvedValue({
      jeton: 'fictif',
      capacite: { partie: 'locataire', dossierId: ID },
    })
    reponses.dossiers.data = {
      id: ID,
      reference: 'TEST',
      statut,
      expire_le: '2026-12-01',
      paye_le: '2026-09-01',
      email_garant: 'garant@example.invalid',
      garant_verrouille: true,
    }
    expect(formulaireGarant(await locataire())).toMatchObject({
      garantActuel: 'garant@example.invalid',
      verrouille: true,
    })
  },
)

test('un dossier termine sans garant ne propose pas une nouvelle designation', async () => {
  doublures.capacite.mockResolvedValue({
    jeton: 'fictif',
    capacite: { partie: 'locataire', dossierId: ID },
  })
  reponses.dossiers.data = {
    id: ID,
    reference: 'TEST',
    statut: 'transmis',
    expire_le: '2026-12-01',
    paye_le: '2026-09-01',
    email_garant: null,
  }
  expect(formulaireGarant(await locataire())).toBeUndefined()
})

// Les pages reelles sont executees avec une API locale doublee : ces tests
// portent la presentation des pannes, pas l'application des politiques RLS.
describe('les pages ne confondent pas une panne avec une absence', () => {
  for (const [nom, page, tables] of [
    ['locataire', locataire, ['dossiers']],
    ['garant', PageGarant, ['dossiers', 'engagements', 'pieces']],
    ['agence', PageEspace, ['dossiers']],
    ['dossier agence', dossier, ['dossiers', 'engagements', 'pieces', 'journal_acces']],
  ] as const) {
    for (const table of tables) {
      test(`${nom} : panne ${table}, aucune fausse absence ni donnee brute`, async () => {
        if (nom === 'locataire')
          doublures.capacite.mockResolvedValue({
            jeton: 'fictif',
            capacite: { partie: 'locataire', dossierId: ID },
          })
        reponses[table] = { data: null, error: { message: 'revenu_confidentiel_12345 SQL' } }
        await expect(page()).rejects.toThrow('Chargement du dossier indisponible.')
      })
    }
  }
})

describe('le routage des pages reste ferme', () => {
  test('sans capacite, les deux porteurs ne lisent aucune table', async () => {
    doublures.capacite.mockResolvedValue(null)
    await expect(locataire()).rejects.toThrow('redirection:/lien-invalide')
    await expect(PageGarant()).rejects.toThrow('redirection:/lien-invalide')
    expect(requetes).toEqual([])
  })
  test('un garant ne lit pas la page du locataire', async () => {
    await expect(locataire()).rejects.toThrow('redirection:/garant')
    expect(requetes).toEqual([])
  })
  test('un locataire ne lit pas la page du garant', async () => {
    doublures.capacite.mockResolvedValue({
      jeton: 'fictif',
      capacite: { partie: 'locataire', dossierId: ID },
    })
    await expect(PageGarant()).rejects.toThrow('redirection:/locataire')
    expect(requetes).toEqual([])
  })
  test('une agence anonyme ne lit aucun dossier', async () => {
    doublures.contexte.mockResolvedValue({ etat: 'anonyme' })
    await expect(PageEspace()).rejects.toThrow('redirection:/connexion')
    await expect(dossier()).rejects.toThrow('redirection:/connexion')
    expect(requetes).toEqual([])
  })
  test('une vraie absence reste invisible', async () => {
    reponses.dossiers = { data: null, error: null }
    await expect(PageGarant()).rejects.toThrow('redirection:/lien-invalide')
    await expect(dossier()).rejects.toThrow('introuvable')
  })
})
