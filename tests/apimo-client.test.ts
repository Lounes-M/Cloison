import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErreurApimo, creerClientApimo, libelleDuBien } from '@/lib/connecteurs/apimo/client'
import { FAUX_IDENTIFIANTS, bienFictif, demarrerFauxApimo, type FauxApimo } from './doublures/apimo'

let faux: FauxApimo
const client = (options: { autoriserEcritures?: boolean; budget?: AbortSignal } = {}) =>
  creerClientApimo(FAUX_IDENTIFIANTS, { ...options, transport: faux.transport })
const code = async (action: Promise<unknown>) => {
  try {
    await action
  } catch (erreur) {
    expect(erreur).toBeInstanceOf(ErreurApimo)
    return (erreur as ErreurApimo).code
  }
  throw new Error('Cet appel aurait du echouer')
}
beforeEach(async () => {
  faux = await demarrerFauxApimo([bienFictif(1), bienFictif(2)])
})
afterEach(async () => {
  await faux.fermer()
  vi.restoreAllMocks()
})

describe('Lecture des biens sur un faux serveur', () => {
  it('appelle la seule origine officielle, en Basic, sans le jeton dans l adresse', async () => {
    await client().lireBiensALouer()
    expect(faux.origines).toEqual(['https://api.apimo.pro'])
    expect(faux.recues).toHaveLength(1)
    expect(faux.recues[0]).toMatchObject({
      methode: 'GET',
      chemin: '/agencies/777/properties?limit=50&offset=0',
      autorisation: `Basic ${Buffer.from('4242:jeton-fictif-0123456789').toString('base64')}`,
    })
    expect(faux.recues[0]!.chemin).not.toContain(FAUX_IDENTIFIANTS.jeton)
  })

  it('ne retient que les biens a louer en cours, reduits a six faits', async () => {
    faux.biens = [
      bienFictif(1),
      bienFictif(2, { category: 1 }),
      bienFictif(3, { step: 3 }),
      bienFictif(4, { category: 3 }),
      bienFictif(5, { step: undefined, price: { value: '1200.50' }, comments: [] }),
    ]
    const { biens, tronque } = await client().lireBiensALouer()
    expect(tronque).toBe(false)
    expect(biens).toEqual([
      {
        id: '1',
        reference: 'LOC-1',
        titre: 'T2 Croix-Rousse',
        ville: 'Lyon',
        codePostal: '69004',
        loyerCents: 85000,
        surface: 42.5,
        pieces: 2,
      },
      {
        id: '5',
        reference: 'LOC-5',
        titre: null,
        ville: 'Lyon',
        codePostal: '69004',
        loyerCents: 120050,
        surface: 42.5,
        pieces: 2,
      },
    ])
    // Ni adresse, ni photo, ni contact ne franchit le client.
    expect(JSON.stringify(biens)).not.toMatch(/rue Fictive|exemple\.invalid|Lumineux/)
  })

  it('suit la pagination jusqu au bout', async () => {
    faux.biens = Array.from({ length: 120 }, (_, i) => bienFictif(i + 1))
    const { biens, tronque } = await client().lireBiensALouer()
    expect(biens).toHaveLength(120)
    expect(tronque).toBe(false)
    expect(faux.recues.map((r) => r.chemin)).toEqual([
      '/agencies/777/properties?limit=50&offset=0',
      '/agencies/777/properties?limit=50&offset=50',
      '/agencies/777/properties?limit=50&offset=100',
    ])
  })

  it('annonce un parc tronque au-dela de dix pages, sans le presenter complet', async () => {
    faux.biens = Array.from({ length: 501 }, (_, i) => bienFictif(i + 1))
    const { biens, tronque } = await client().lireBiensALouer()
    expect(tronque).toBe(true)
    expect(biens).toHaveLength(500)
    expect(faux.recues).toHaveLength(10)
  })

  it('tolere un champ facultatif inattendu mais refuse une fiche sans identifiant', async () => {
    faux.biens = [bienFictif(1, { price: 'gratuit', city: 12, area: null, rooms: 'deux' })]
    expect((await client().lireBiensALouer()).biens[0]).toMatchObject({
      id: '1',
      loyerCents: null,
      ville: null,
      surface: null,
      pieces: null,
    })
    faux.biens = [bienFictif(1), { reference: 'sans identifiant', category: 2 }]
    expect(await code(client().lireBiensALouer())).toBe('reponse')
  })

  it('nettoie et borne les textes du fournisseur', async () => {
    faux.biens = [
      bienFictif(9, {
        reference: 'R\u0000EF\n  9',
        comments: [{ language: 'fr', title: `${'x'.repeat(200)} ` }],
      }),
    ]
    const [bien] = (await client().lireBiensALouer()).biens
    expect(bien!.reference).toBe('R EF 9')
    expect(bien!.titre).toHaveLength(80)
    expect(libelleDuBien(bien!).length).toBeLessThanOrEqual(120)
  })

  it.each([
    [{ statut: 401 }, 'refus'],
    [{ statut: 403 }, 'refus'],
    [{ statut: 404 }, 'refus'],
    [{ statut: 400 }, 'refus'],
    [{ statut: 429 }, 'limite'],
    [{ statut: 500 }, 'indisponible'],
    [{ statut: 503 }, 'indisponible'],
    [{ statut: 204 }, 'reponse'],
    [{ statut: 200, corps: '<html>', type: 'text/html' }, 'reponse'],
    [{ statut: 200, corps: '{"properties":' }, 'reponse'],
    [{ statut: 200, corps: '{"biens":[]}' }, 'reponse'],
    [{ statut: 200, corps: '[]' }, 'reponse'],
    [{ coupure: true as const }, 'indisponible'],
  ])('traduit %j en %s, sans liste vide de secours', async (reponse, attendu) => {
    faux.prochaine(reponse)
    expect(await code(client().lireBiensALouer())).toBe(attendu)
    expect(faux.recues).toHaveLength(1)
  })

  it('refuse le mauvais jeton et une autre agence que la sienne', async () => {
    const autre = creerClientApimo(
      { ...FAUX_IDENTIFIANTS, jeton: 'un-autre-jeton-000' },
      { transport: faux.transport },
    )
    expect(await code(autre.verifier())).toBe('refus')
    const ailleurs = creerClientApimo(
      { ...FAUX_IDENTIFIANTS, agenceApimo: '778' },
      { transport: faux.transport },
    )
    expect(await code(ailleurs.verifier())).toBe('refus')
    await expect(client().verifier()).resolves.toBeUndefined()
    expect(faux.recues.at(-1)!.chemin).toBe('/agencies/777/properties?limit=1&offset=0')
  })

  it('ne suit aucune redirection : le jeton ne quitte pas l origine', async () => {
    faux.prochaine({ statut: 302, entetes: { Location: 'http://127.0.0.1:9/ailleurs' } })
    expect(await code(client().lireBiensALouer())).toBe('indisponible')
    expect(faux.recues).toHaveLength(1)
  })

  it('refuse une reponse plus lourde que la borne', async () => {
    faux.prochaine({
      statut: 200,
      corps: JSON.stringify({ properties: [], lest: 'x'.repeat(8 * 1024 * 1024) }),
    })
    expect(await code(client().lireBiensALouer())).toBe('reponse')
  })

  it('respecte le budget de l appelant', async () => {
    faux.prochaine({ silence: true })
    expect(await code(client({ budget: AbortSignal.timeout(150) }).lireBiensALouer())).toBe(
      'indisponible',
    )
    expect(await code(client({ budget: AbortSignal.abort() }).lireBiensALouer())).toBe(
      'indisponible',
    )
    expect(faux.recues).toHaveLength(1)
  })
})

describe('Ecriture du suivi', () => {
  it('reste fermee sans autorisation explicite', async () => {
    expect(await code(client().ecrireSuivi('1', 'Cloison, dossier AAAAAAAA : clos.'))).toBe('refus')
    expect(faux.recues).toHaveLength(0)
  })

  it('poste une ligne de suivi sur la fiche du bien', async () => {
    await client({ autoriserEcritures: true }).ecrireSuivi(
      '12',
      'Cloison, dossier AAAAAAAA : clos.',
    )
    expect(faux.recues).toEqual([
      {
        methode: 'POST',
        chemin: '/agencies/777/actions',
        autorisation: expect.stringMatching(/^Basic /),
        corps: { type: 10, property: 12, comment: 'Cloison, dossier AAAAAAAA : clos.' },
      },
    ])
  })

  it('distingue le refus net de l issue inconnue, et ne rejoue jamais', async () => {
    const c = client({ autoriserEcritures: true })
    faux.prochaine({ statut: 422 })
    expect(await code(c.ecrireSuivi('12', 'message'))).toBe('reponse')
    faux.prochaine({ statut: 403 })
    expect(await code(c.ecrireSuivi('12', 'message'))).toBe('refus')
    faux.prochaine({ statut: 500 })
    expect(await code(c.ecrireSuivi('12', 'message'))).toBe('indisponible')
    faux.prochaine({ coupure: true })
    expect(await code(c.ecrireSuivi('12', 'message'))).toBe('incertain')
    expect(faux.recues).toHaveLength(4)
  })

  it.each([
    ['', 'message'],
    ['12a', 'message'],
    ['../7', 'message'],
    ['12', ''],
    ['12', 'x'.repeat(301)],
  ])('refuse le bien %j ou le message avant tout appel', async (bien, message) => {
    expect(await code(client({ autoriserEcritures: true }).ecrireSuivi(bien, message))).toBe(
      'reponse',
    )
    expect(faux.recues).toHaveLength(0)
  })
})

describe('Configuration du client', () => {
  it.each([
    { fournisseur: '42a' },
    { fournisseur: '' },
    { agenceApimo: '7/../8' },
    { agenceApimo: '12345678901' },
    { jeton: 'court' },
    { jeton: 'avec espace dedans' },
    { jeton: 'retour\nligne-000' },
    { jeton: 'accentué-000000' },
  ])('refuse %j sans appeler le reseau', (changement) => {
    const transport = vi.fn<typeof fetch>()
    expect(() => creerClientApimo({ ...FAUX_IDENTIFIANTS, ...changement }, { transport })).toThrow(
      ErreurApimo,
    )
    expect(transport).not.toHaveBeenCalled()
  })

  it('une erreur ne porte ni jeton, ni identifiant, ni contenu du fournisseur', async () => {
    faux.prochaine({ statut: 401, corps: '{"detail":"secret-du-fournisseur"}' })
    try {
      await client().lireBiensALouer()
    } catch (erreur) {
      const visible = `${String(erreur)} ${JSON.stringify(erreur)} ${(erreur as Error).stack}`
      expect(visible).not.toMatch(/jeton-fictif|4242|secret-du-fournisseur|Basic/)
    }
  })
})

describe('Libelle du logement', () => {
  it.each([
    [{ titre: 'T2 Croix-Rousse', reference: 'LOC-1' }, 'T2 Croix-Rousse (LOC-1), 69004 Lyon'],
    [{ titre: null, reference: 'LOC-1' }, 'Bien LOC-1, 69004 Lyon'],
    [{ titre: null, reference: null, ville: null, codePostal: null }, 'Bien 1'],
  ] as const)('compose %j en %s', (changement, attendu) => {
    expect(
      libelleDuBien({
        id: '1',
        ville: 'Lyon',
        codePostal: '69004',
        loyerCents: null,
        surface: null,
        pieces: null,
        ...changement,
      }),
    ).toBe(attendu)
  })
})
