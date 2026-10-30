import { beforeEach, describe, expect, test, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
import { FormulaireGarant } from '@/components/forms/FormulaireGarant'
import { FormulaireDepot } from '@/components/forms/FormulaireDepot'
import { ResteAFaireGarant } from '@/components/dossiers/ResteAFaireGarant'
import { PastillesSuivi } from '@/components/dossiers/PastillesSuivi'
import { ResteAFaireLocataire } from '@/components/dossiers/ResteAFaireLocataire'
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
  borne: vi.fn(),
  rpc: vi.fn(),
  colonnes: vi.fn(),
  egal: vi.fn(),
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
        select: (...args: unknown[]) => {
          doublures.colonnes(table, ...args)
          return chaine
        },
        gt: (...args: unknown[]) => {
          doublures.borne('gt', ...args)
          return chaine
        },
        lte: (...args: unknown[]) => {
          doublures.borne('lte', ...args)
          return chaine
        },
        eq: (...args: unknown[]) => {
          doublures.egal(...args)
          return chaine
        },
        not: () => chaine,
        in: (...args: unknown[]) => {
          doublures.egal('in', ...args)
          return chaine
        },
        lt: (...args: unknown[]) => {
          doublures.borne('lt', ...args)
          return chaine
        },
        is: () => chaine,
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
      if (nom === 'mon_tarif_paiement' && reponses.tarif) return reponses.tarif
      if (nom === 'agence_de_mon_dossier' && reponses.agence) return reponses.agence
      if (nom === 'relances_du_dossier' && reponses.relances) return reponses.relances
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
    complements_documentaires: { data: [], error: null },
    logements: { data: [], error: null },
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

test.each(['retraite', 'independant'])(
  'le profil %s propose ses justificatifs sans exiger de bulletin',
  async (profil) => {
    reponses.engagements = { data: { profil_ressources: profil }, error: null }
    const propositions: string[] = []
    function visiter(noeud: ReactNode) {
      if (Array.isArray(noeud)) noeud.forEach(visiter)
      if (isValidElement<{ children?: ReactNode; nature?: string }>(noeud)) {
        if (noeud.type === FormulaireDepot) propositions.push(noeud.props.nature!)
        visiter(noeud.props.children)
      }
    }
    visiter(await PageGarant())
    expect(propositions).not.toContain('bulletin_paie')
    expect(propositions).toContain(
      profil === 'retraite' ? 'pension_retraite' : 'activite_independante',
    )
    expect(propositions).toContain('piece_identite')
  },
)

test('le garant et le locataire voient quelle agence suit le dossier', async () => {
  reponses.agence = {
    data: [{ agence: 'Logis Lyon', logement: 'T2 Gerland', ville: 'Lyon 7e' }],
    error: null,
  }
  reponses.dossiers = {
    data: { ...(reponses.dossiers!.data as object), agence_id: ID },
    error: null,
  }
  function textes(noeud: ReactNode, sortie: string[] = []): string[] {
    if (typeof noeud === 'string') sortie.push(noeud)
    if (Array.isArray(noeud)) noeud.forEach((n) => textes(n, sortie))
    if (isValidElement<{ children?: ReactNode }>(noeud)) textes(noeud.props.children, sortie)
    return sortie
  }
  expect(textes(await PageGarant()).join(' ')).toContain(
    'Ce dossier est suivi par Logis Lyon pour le logement « T2 Gerland » (Lyon 7e).',
  )
  doublures.capacite.mockResolvedValue({
    jeton: 'fictif',
    capacite: { partie: 'locataire', dossierId: ID },
  })
  expect(textes(await locataire()).join(' ')).toContain('Ton dossier est suivi par Logis Lyon')
  reponses.agence = { data: null, error: { message: 'panne' } }
  expect(textes(await locataire()).join(' ')).not.toContain('suivi par')
})

test('le paiement affiche le prix reserve et transmet exactement cette offre', async () => {
  doublures.capacite.mockResolvedValue({
    jeton: 'fictif',
    capacite: { partie: 'locataire', dossierId: ID },
  })
  reponses.tarif = {
    data: [{ montant_cents: 800, devise: 'eur', tarif_version: 'ancien' }],
    error: null,
  }
  const champs: Record<string, unknown> = {}
  const textes: string[] = []
  function visiter(noeud: ReactNode) {
    if (typeof noeud === 'string') textes.push(noeud)
    if (Array.isArray(noeud)) noeud.forEach(visiter)
    if (isValidElement<{ children?: ReactNode; name?: string; value?: unknown }>(noeud)) {
      if (noeud.type === 'input' && noeud.props.name) champs[noeud.props.name] = noeud.props.value
      visiter(noeud.props.children)
    }
  }
  visiter(await locataire())
  expect(champs).toMatchObject({ tarif_version: 'ancien', montant_cents: 800 })
  expect(textes.join(' ').replace(/\s/g, ' ')).toContain('8 €')
  expect(textes.join(' ').replace(/\s/g, ' ')).not.toContain('9 €')
})

test('un tarif reserve illisible ne propose pas un prix de remplacement', async () => {
  doublures.capacite.mockResolvedValue({
    jeton: 'fictif',
    capacite: { partie: 'locataire', dossierId: ID },
  })
  reponses.tarif = {
    data: [{ montant_cents: 800, devise: 'usd', tarif_version: 'ancien' }],
    error: null,
  }
  await expect(locataire()).rejects.toThrow('Tarif indisponible')
})
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
    ['garant', PageGarant, ['dossiers', 'engagements', 'pieces', 'complements_documentaires']],
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
  test.each(['mes', 'sans'])(
    'la pagination conserve le responsable %s et le statut',
    async (responsable) => {
      reponses.dossiers!.data = []
      const arbre = elements(
        await PageEspace({
          searchParams: Promise.resolve({ page: '2', statut: 'complet', responsable }),
        }),
      )
      expect(arbre.map((e) => e.props.href)).toContain(
        `/espace?page=1&statut=complet&responsable=${responsable}`,
      )
    },
  )

  test.each(['7', '30'])(
    'echeance %s : fenetre bornee et pagination conservee',
    async (horizon) => {
      reponses.dossiers!.data = []
      const avant = Date.now()
      const arbre = elements(
        await PageEspace({
          searchParams: Promise.resolve({
            page: '2',
            tri: 'echeance',
            horizon,
            responsable: 'mes',
          }),
        }),
      )
      const appels = doublures.borne.mock.calls
      expect(appels).toHaveLength(2)
      expect(appels[0]!.slice(0, 2)).toEqual(['gt', 'expire_le'])
      expect(appels[1]!.slice(0, 2)).toEqual(['lte', 'expire_le'])
      const debut = Date.parse(appels[0]![2] as string)
      expect(debut).toBeGreaterThanOrEqual(avant)
      expect(debut).toBeLessThanOrEqual(Date.now())
      expect(Date.parse(appels[1]![2] as string) - debut).toBe(Number(horizon) * 86400000)
      expect(doublures.ordre.mock.calls).toEqual([
        ['expire_le', { ascending: true }],
        ['id', { ascending: false }],
      ])
      expect(arbre.map((e) => e.props.href)).toContain(
        `/espace?page=1&responsable=mes&tri=echeance&horizon=${horizon}`,
      )
    },
  )

  test.each([
    ['activite', 'activite_rappel_le', true],
    ['echeance', 'expire_le', true],
    ['recent', 'cree_le', false],
    ['inconnu', 'cree_le', false],
  ] as const)('le tri %s ordonne par %s', async (tri, colonne, ascending) => {
    reponses.dossiers!.data = []
    const arbre = elements(await PageEspace({ searchParams: Promise.resolve({ page: '2', tri }) }))
    expect(doublures.ordre.mock.calls).toEqual([
      [colonne, { ascending }],
      ['id', { ascending: false }],
    ])
    const lien = tri === 'activite' || tri === 'echeance' ? `&tri=${tri}` : ''
    expect(arbre.map((e) => e.props.href)).toContain(`/espace?page=1${lien}`)
  })

  test('le filtre des remplacements ne garde que les dossiers ou une piece attend l agence', async () => {
    reponses.dossiers!.data = []
    const arbre = elements(
      await PageEspace({ searchParams: Promise.resolve({ page: '2', remplacement: '1' }) }),
    )
    const colonnes = doublures.colonnes.mock.calls.find(([table]) => table === 'dossiers')![1]
    expect(colonnes).toContain('remplacements:complements_documentaires!inner(id)')
    expect(doublures.egal).toHaveBeenCalledWith('remplacements.etat', 'fourni')
    expect(arbre.map((e) => e.props.href)).toContain('/espace?page=1&remplacement=1')

    vi.clearAllMocks()
    await PageEspace({ searchParams: Promise.resolve({ remplacement: 'oui' }) })
    expect(doublures.colonnes.mock.calls.find(([table]) => table === 'dossiers')![1]).not.toContain(
      'complements_documentaires!inner',
    )
    expect(doublures.egal).not.toHaveBeenCalledWith('remplacements.etat', 'fourni')
  })

  test('chaque ligne porte ses pastilles de suivi', async () => {
    reponses.dossiers!.data = [
      {
        id: 'dossier-a',
        reference: 'REF-A',
        email_locataire: 'a@example.invalid',
        statut: 'ouvert',
        cree_le: '2026-09-01',
        expire_le: '2099-01-01',
        activite_rappel_le: '2020-01-01T00:00:00Z',
        suivi: [{ etat: 'fourni' }],
        engagements: null,
      },
    ]
    const arbre = elements(await PageEspace())
    const pastilles = arbre.filter((e) => e.type === PastillesSuivi)
    expect(pastilles).toHaveLength(2)
    expect(pastilles[0]!.props.pastilles).toEqual(['remplacement', 'sans_nouvelles'])
    const colonnes = doublures.colonnes.mock.calls.find(([table]) => table === 'dossiers')![1]
    expect(colonnes).toContain('activite_rappel_le, suivi:complements_documentaires(etat)')
  })

  test('sans nouvelles : dossiers en attente et inactifs depuis sept jours', async () => {
    reponses.dossiers!.data = []
    const avant = Date.now()
    const arbre = elements(
      await PageEspace({ searchParams: Promise.resolve({ page: '2', sans_nouvelles: '1' }) }),
    )
    expect(doublures.egal).toHaveBeenCalledWith('in', 'statut', ['ouvert', 'depot_en_cours'])
    const [, colonne, limite] = doublures.borne.mock.calls.find(([op]) => op === 'lt')!
    expect(colonne).toBe('activite_rappel_le')
    expect(avant - Date.parse(limite as string)).toBeGreaterThanOrEqual(7 * 86400000 - 1000)
    expect(avant - Date.parse(limite as string)).toBeLessThanOrEqual(7 * 86400000)
    expect(arbre.map((e) => e.props.href)).toContain('/espace?page=1&sans_nouvelles=1')
  })

  test.each(['0', '-7', '365', ['7', '30'], '7);drop'])(
    'horizon invalide %s ignore',
    async (horizon) => {
      reponses.dossiers!.data = []
      await PageEspace({ searchParams: Promise.resolve({ horizon, tri: 'expire_le.desc' }) })
      expect(doublures.borne).not.toHaveBeenCalled()
      expect(doublures.ordre.mock.calls).toEqual([
        ['cree_le', { ascending: false }],
        ['id', { ascending: false }],
      ])
    },
  )

  test('dates du coffre visibles sans confondre la duree de l acte', async () => {
    reponses.dossiers!.data = [
      {
        id: ID,
        reference: 'REF',
        statut: 'signe',
        email_locataire: 'essai@example.invalid',
        cree_le: '2026-09-01',
        expire_le: '2027-01-01T23:30:00Z',
        engagements: null,
      },
    ]
    const arbre = await PageEspace()
    expect(texteVisible(arbre)).toContain('Fin du coffre : 2 janv. 2027')
    expect(texteVisible(arbre)).toContain('elle ne décrit pas la durée de l’acte signé')
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

test('le garant voit ce qu il lui reste a faire tant que le depot est ouvert', async () => {
  function textes(noeud: ReactNode, sortie: string[] = []): string[] {
    if (typeof noeud === 'string') sortie.push(noeud)
    if (Array.isArray(noeud)) noeud.forEach((n) => textes(n, sortie))
    if (isValidElement<{ children?: ReactNode }>(noeud)) {
      if (noeud.type === ResteAFaireGarant) {
        textes(ResteAFaireGarant(noeud.props as Parameters<typeof ResteAFaireGarant>[0]), sortie)
      }
      textes(noeud.props.children, sortie)
    }
    return sortie
  }
  const ouvert = textes(await PageGarant()).join(' ')
  expect(ouvert).toContain('Ce qu’il vous reste à faire')
  expect(ouvert).toContain('Bulletins de paie : 3 documents manquants sur 3.')
  reponses.dossiers = {
    data: { ...(reponses.dossiers!.data as object), statut: 'transmis' },
    error: null,
  }
  expect(textes(await PageGarant()).join(' ')).not.toContain('Ce qu’il vous reste à faire')
})

test('le locataire voit ses propres gestes, jamais les pieces de son garant', async () => {
  doublures.capacite.mockResolvedValue({
    jeton: 'fictif',
    capacite: { partie: 'locataire', dossierId: ID },
  })
  function textes(noeud: ReactNode, sortie: string[] = []): string[] {
    if (typeof noeud === 'string') sortie.push(noeud)
    if (Array.isArray(noeud)) noeud.forEach((n) => textes(n, sortie))
    if (isValidElement<{ children?: ReactNode }>(noeud)) {
      if (noeud.type === ResteAFaireLocataire) {
        textes(
          ResteAFaireLocataire(noeud.props as Parameters<typeof ResteAFaireLocataire>[0]),
          sortie,
        )
      }
      textes(noeud.props.children, sortie)
    }
    return sortie
  }
  reponses.dossiers = {
    data: {
      ...(reponses.dossiers!.data as object),
      agence_id: ID,
      loyer_cents: null,
      email_garant: null,
    },
    error: null,
  }
  const avant = textes(await locataire()).join(' ')
  expect(avant).toContain('Ce qu’il te reste à faire')
  expect(avant).toContain('Indique le loyer mensuel, charges comprises.')
  expect(avant).toContain('Désigne ton garant')
  expect(avant).not.toContain('Règle le dossier')

  reponses.dossiers = {
    data: {
      ...(reponses.dossiers!.data as object),
      loyer_cents: 90000,
      email_garant: 'garant@example.test',
    },
    error: null,
  }
  const apres = textes(await locataire()).join(' ')
  expect(apres).toContain('Rien à faire de ton côté pour l’instant.')
  expect(apres).not.toContain('Bulletins')
})

test('la fiche d un dossier dit sa derniere activite et porte ses pastilles', async () => {
  reponses.dossiers = {
    data: {
      ...(reponses.dossiers!.data as object),
      statut: 'depot_en_cours',
      activite_rappel_le: '2020-01-02T10:00:00Z',
    },
    error: null,
  }
  reponses.complements_documentaires = {
    data: [
      {
        id: 'c1',
        nature: 'bulletin_paie',
        motif: 'illisible',
        etat: 'fourni',
        piece_initiale: 'p1',
        piece_fournie: 'p2',
        cree_le: '2020-01-01T00:00:00Z',
        attendu_depuis: '2020-01-01T00:00:00Z',
      },
    ],
    error: null,
  }
  const page = await PageDossier({ params: Promise.resolve({ id: ID }) })
  expect(texteVisible(page)).toContain('Dernière activité sur le dossier : 2 janvier 2020')
  const pastilles = elements(page).find((e) => e.type === PastillesSuivi)
  expect(pastilles?.props.pastilles).toEqual(['remplacement', 'sans_nouvelles'])
  expect(texteVisible(page)).not.toContain('Relances automatiques')
})

test('la fiche d un dossier dit combien de relances le garant a recues', async () => {
  reponses.relances = {
    data: [{ nombre: 2, derniere: '2020-01-05T09:00:00Z' }],
    error: null,
  }
  const page = await PageDossier({ params: Promise.resolve({ id: ID }) })
  expect(doublures.rpc).toHaveBeenCalledWith('relances_du_dossier', { le_dossier: ID })
  expect(texteVisible(page)).toContain(
    'Relances automatiques au garant : 2 sur 3, la dernière le 5 janvier 2020',
  )
})
