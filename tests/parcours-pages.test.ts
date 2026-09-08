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
  plage: vi.fn(),
  filtre: vi.fn(),
  ordre: vi.fn(),
  rpc: vi.fn(),
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
        order: (...args: unknown[]) => {
          doublures.ordre(...args)
          return chaine
        },
        range: (...args: unknown[]) => {
          doublures.plage(...args)
          return chaine
        },
        ilike: (...args: unknown[]) => {
          doublures.filtre(...args)
          return chaine
        },
        limit: () => chaine,
        maybeSingle: () => chaine,
        then: (resolve: (reponse: Reponse) => unknown) =>
          Promise.resolve(reponses[table]!).then(resolve),
      }
      return chaine
    },
    rpc: vi.fn(async (nom: string, params: unknown) => {
      doublures.rpc(nom, params)
      if (nom === 'journal_du_dossier') {
        requetes.push('journal_acces')
        return reponses.journal_acces!
      }
      return { data: [], error: null }
    }),
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
    reponses.dossiers!.data = {
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
  reponses.dossiers!.data = {
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

function elements(noeud: ReactNode): { type: unknown; props: Record<string, unknown> }[] {
  if (Array.isArray(noeud)) return noeud.flatMap(elements)
  if (!isValidElement<{ children?: ReactNode }>(noeud)) return []
  return [{ type: noeud.type, props: noeud.props }, ...elements(noeud.props.children)]
}

describe('la liste des dossiers reste bornee et navigable', () => {
  test('51 resultats ne rendent que 50 dossiers et annoncent la suite', async () => {
    reponses.dossiers!.data = Array.from({ length: 51 }, (_, i) => ({
      id: `dossier-${i}`,
      reference: `REF-${i}`,
      email_locataire: 'essai@example.invalid',
      statut: 'ouvert',
      cree_le: '2026-09-01',
      engagements: null,
    }))
    const arbre = elements(await PageEspace())
    const liens = arbre.map((e) => e.props.href).filter(Boolean)
    expect(liens).toContain('/espace/dossiers/dossier-49')
    expect(liens).not.toContain('/espace/dossiers/dossier-50')
    expect(liens).toContain('/espace?page=2')
    expect(doublures.plage).toHaveBeenCalledWith(0, 50)
    expect(doublures.ordre).toHaveBeenCalledWith('id', { ascending: false })
  })

  test('la page suivante conserve les filtres litteraux et permet de revenir', async () => {
    reponses.dossiers!.data = []
    const arbre = elements(
      await PageEspace({
        searchParams: Promise.resolve({
          page: '3',
          reference: ' AB_10% ',
          email: 'test+un@example.invalid',
        }),
      }),
    )
    expect(doublures.plage).toHaveBeenCalledWith(100, 150)
    expect(doublures.filtre).toHaveBeenCalledWith('reference', '%AB\\_10\\%%')
    expect(doublures.filtre).toHaveBeenCalledWith('email_locataire', '%test+un@example.invalid%')
    expect(arbre.map((e) => e.props.href)).toContain(
      '/espace?page=2&reference=AB_10%25&email=test%2Bun%40example.invalid',
    )
    expect(arbre.filter((e) => e.type === 'form').some((e) => e.props.method === 'get')).toBe(true)
  })

  test.each(['0', '-1', '2.5', '1e2', '999999999999999999999', ['2', '3']])(
    'page invalide %s : retour a une plage sure',
    async (page) => {
      reponses.dossiers!.data = []
      await PageEspace({ searchParams: Promise.resolve({ page }) })
      expect(doublures.plage).toHaveBeenCalledWith(0, 50)
    },
  )
})

function texteVisible(noeud: ReactNode): string {
  if (typeof noeud === 'string' || typeof noeud === 'number') return String(noeud)
  if (Array.isArray(noeud)) return noeud.map(texteVisible).join(' ')
  return isValidElement<{ children?: ReactNode }>(noeud) ? texteVisible(noeud.props.children) : ''
}
test.each(['garant', 'agence'])(
  'le journal %s transmet le curseur exact et cache la ligne sentinelle',
  async (role) => {
    const quand = '2026-09-08T12:00:00.123456+00:00',
      evenement = '00000000-0000-4000-8000-000000000092'
    const avant = Buffer.from(JSON.stringify([ID, quand, evenement])).toString('base64url')
    reponses.journal_acces = {
      data: Array.from({ length: 51 }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        quand,
        acteur: 'agence',
        action: 'dossier_consulte',
        identite: i === 50 ? 'sentinelle@example.invalid' : `agence${i}@example.invalid`,
      })),
      error: null,
    }
    const page =
      role === 'garant'
        ? await PageGarant({ searchParams: Promise.resolve({ avant }) })
        : await PageDossier({
            params: Promise.resolve({ id: ID }),
            searchParams: Promise.resolve({ avant }),
          })
    expect(doublures.rpc).toHaveBeenCalledWith('journal_du_dossier', {
      le_dossier: ID,
      avant_quand: quand,
      avant_id: evenement,
    })
    expect(texteVisible(page)).toContain('agence49@example.invalid')
    expect(texteVisible(page)).not.toContain('sentinelle@example.invalid')
  },
)
