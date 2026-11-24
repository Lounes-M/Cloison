import { randomBytes } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

const doubles = vi.hoisted(() => ({
  contexte: vi.fn(),
  rpc: vi.fn(),
  maj: vi.fn(),
  ouvrir: vi.fn(),
  livrer: vi.fn(),
  langue: vi.fn(),
  revalider: vi.fn(),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: doubles.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: doubles.revalider }))
vi.mock('@/lib/acces/session', () => ({ ouvrirDossierAvecLien: doubles.ouvrir }))
vi.mock('@/lib/courriels/livraison-liens', () => ({ reprendreLivraisonLiens: doubles.livrer }))
vi.mock('@/lib/langue-preferee', () => ({ reglerLangueDossier: doubles.langue }))

import { gererApimo, ouvrirDepuisApimo } from '@/lib/connecteurs/apimo/action'
import { ouvrirIdentifiantsApimo, scellerIdentifiantsApimo } from '@/lib/connecteurs/apimo/secret'
import { FAUX_IDENTIFIANTS, bienFictif, demarrerFauxApimo, type FauxApimo } from './doublures/apimo'

const agence = '11111111-1111-4111-8111-111111111111'
const logement = '22222222-2222-4222-8222-222222222222'
const dossier = '33333333-3333-4333-8333-333333333333'
let faux: FauxApimo
let scelle: string
/** Ce que la base rendrait, fonction par fonction. */
let base: Record<string, unknown>

const contexte = (changement: Record<string, unknown> = {}) => ({
  etat: 'rattache',
  role: 'admin',
  agence: { id: agence, statut: 'verifiee' },
  supabase: {
    rpc: doubles.rpc,
    from: () => ({
      update: (v: unknown) => ({ eq: (c: string, id: string) => doubles.maj(v, c, id) }),
    }),
  },
  ...changement,
})
beforeAll(() => {
  process.env.CLE_MAITRESSE = randomBytes(32).toString('base64')
})
afterAll(() => {
  delete process.env.CLE_MAITRESSE
})
beforeEach(async () => {
  process.env.CONNECTEUR_APIMO = 'true'
  faux = await demarrerFauxApimo([bienFictif(12), bienFictif(13, { price: null })])
  vi.stubGlobal('fetch', faux.transport)
  scelle = scellerIdentifiantsApimo({ agence, ...FAUX_IDENTIFIANTS })
  base = {
    configurer_apimo: true,
    regler_retour_apimo: true,
    retirer_apimo: true,
    noter_apimo: true,
    acces_apimo: {
      agence,
      fournisseur: FAUX_IDENTIFIANTS.fournisseur,
      agence_apimo: FAUX_IDENTIFIANTS.agenceApimo,
      jeton_scelle: scelle,
    },
    logement_du_bien_apimo: logement,
    lier_dossier_apimo: true,
  }
  doubles.contexte.mockResolvedValue(contexte())
  doubles.rpc.mockImplementation(async (nom: string) => ({ data: base[nom] ?? null, error: null }))
  doubles.maj.mockResolvedValue({ error: null })
  doubles.ouvrir.mockResolvedValue({ dossierId: dossier, reference: 'AAAAAAAAAAAA' })
})
afterEach(async () => {
  await faux.fermer()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  delete process.env.CONNECTEUR_APIMO
})

const form = (valeurs: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v)
  return f
}
const configuration = (changement: Record<string, string> = {}) =>
  form({
    agence,
    confirmation: 'on',
    operation: 'configurer',
    fournisseur: ' 4242 ',
    agenceApimo: '777',
    jeton: FAUX_IDENTIFIANTS.jeton,
    retour: 'on',
    ...changement,
  })
const appels = (nom: string) => doubles.rpc.mock.calls.filter((a) => a[0] === nom)

describe('Configurer la connexion', () => {
  test('ferme, le connecteur ne lit ni la session ni Apimo', async () => {
    delete process.env.CONNECTEUR_APIMO
    expect(await gererApimo(configuration())).toEqual({ ok: false, motif: 'general' })
    expect(doubles.contexte).not.toHaveBeenCalled()
    expect(faux.recues).toHaveLength(0)
  })

  test.each([
    { etat: 'anonyme' },
    { etat: 'rattache', role: 'membre' },
    { etat: 'rattache', role: 'admin', agence: { id: '99999999-9999-4999-8999-999999999999' } },
  ])('refuse %j avant tout appel', async (c) => {
    doubles.contexte.mockResolvedValue(contexte(c))
    for (const operation of ['configurer', 'retour', 'retirer'])
      expect(await gererApimo(configuration({ operation }))).toEqual({
        ok: false,
        motif: 'session',
      })
    expect(doubles.rpc).not.toHaveBeenCalled()
    expect(faux.recues).toHaveLength(0)
  })

  test('exige la confirmation', async () => {
    expect(await gererApimo(configuration({ confirmation: '' }))).toEqual({
      ok: false,
      motif: 'session',
    })
    expect(faux.recues).toHaveLength(0)
  })

  test.each([
    { fournisseur: 'abc' },
    { agenceApimo: '' },
    { jeton: 'court' },
    { jeton: 'avec un espace 000' },
  ] as Record<string, string>[])('refuse la saisie %j sans appeler Apimo', async (changement) => {
    expect(await gererApimo(configuration(changement))).toEqual({ ok: false, motif: 'saisie' })
    expect(faux.recues).toHaveLength(0)
    expect(doubles.rpc).not.toHaveBeenCalled()
  })

  test('n enregistre rien tant qu Apimo n a pas accepte les identifiants', async () => {
    expect(await gererApimo(configuration({ jeton: 'un-mauvais-jeton-000' }))).toEqual({
      ok: false,
      motif: 'refus',
    })
    expect(await gererApimo(configuration({ agenceApimo: '778' }))).toEqual({
      ok: false,
      motif: 'refus',
    })
    faux.prochaine({ statut: 503 })
    expect(await gererApimo(configuration())).toEqual({ ok: false, motif: 'indisponible' })
    faux.prochaine({ statut: 200, corps: '{"autre":1}' })
    expect(await gererApimo(configuration())).toEqual({ ok: false, motif: 'reponse' })
    expect(doubles.rpc).not.toHaveBeenCalled()
  })

  test('verifie chez Apimo, puis n envoie a la base qu un scelle', async () => {
    expect(await gererApimo(configuration())).toEqual({ ok: true, fait: 'configure' })
    expect(faux.recues.map((r) => r.chemin)).toEqual(['/agencies/777/properties?limit=1&offset=0'])
    const [, params] = appels('configurer_apimo')[0]!
    expect(params).toMatchObject({
      le_fournisseur: '4242',
      l_agence_apimo: '777',
      le_retour: true,
    })
    // Le jeton ne part jamais en clair, et le scelle est lie a cette agence.
    expect(JSON.stringify(doubles.rpc.mock.calls)).not.toContain(FAUX_IDENTIFIANTS.jeton)
    expect(
      ouvrirIdentifiantsApimo(params.le_jeton_scelle, {
        agence,
        fournisseur: '4242',
        agenceApimo: '777',
      }).jeton,
    ).toBe(FAUX_IDENTIFIANTS.jeton)
    expect(doubles.revalider).toHaveBeenCalledWith('/espace/connecteurs')
  })

  test('le succes depend de la base, et une panne ne revele rien', async () => {
    base.configurer_apimo = false
    expect(await gererApimo(configuration())).toEqual({ ok: false, motif: 'general' })
    doubles.rpc.mockRejectedValue(new Error('secret-prive'))
    const resultat = await gererApimo(configuration())
    expect(resultat).toEqual({ ok: false, motif: 'general' })
    expect(JSON.stringify(resultat)).not.toContain('secret-prive')
  })

  test('regler le retour et retirer ne touchent pas Apimo', async () => {
    expect(await gererApimo(configuration({ operation: 'retour', retour: '' }))).toEqual({
      ok: true,
      fait: 'retour',
    })
    expect(appels('regler_retour_apimo')[0]![1]).toEqual({ le_retour: false })
    expect(await gererApimo(configuration({ operation: 'retirer' }))).toEqual({
      ok: true,
      fait: 'retire',
    })
    base.retirer_apimo = false
    expect(await gererApimo(configuration({ operation: 'retirer' }))).toEqual({
      ok: false,
      motif: 'general',
    })
    expect(await gererApimo(configuration({ operation: 'autre' }))).toEqual({
      ok: false,
      motif: 'general',
    })
    expect(faux.recues).toHaveLength(0)
  })
})

describe('Ouvrir un dossier depuis un bien', () => {
  const ouverture = (changement: Record<string, string> = {}) =>
    ouvrirDepuisApimo(
      { statut: 'inactif' },
      form({ bien: '12', courriel: ' Locataire@Exemple.fr ', ...changement }),
    )

  test.each([
    [{ courriel: 'pas une adresse' }],
    [{ loyer: 'beaucoup' }],
    [{ bien: '' }],
    [{ bien: '12; drop' }],
    [{ bail: 'bail avec espace' }],
    [{ bail: 'x'.repeat(41) }],
  ])('refuse la saisie %j avant la session et avant Apimo', async (changement) => {
    expect((await ouverture(changement)).statut).toBe('erreur')
    expect(doubles.contexte).not.toHaveBeenCalled()
    expect(faux.recues).toHaveLength(0)
    expect(doubles.ouvrir).not.toHaveBeenCalled()
  })

  test.each([
    ['une session absente', { etat: 'anonyme' }],
    ['une agence non verifiee', { agence: { id: agence, statut: 'decouverte' } }],
  ])('n ouvre rien avec %s', async (_cas, c) => {
    doubles.contexte.mockResolvedValue(contexte(c))
    expect((await ouverture()).statut).toBe('erreur')
    expect(doubles.rpc).not.toHaveBeenCalled()
    expect(faux.recues).toHaveLength(0)
    expect(doubles.ouvrir).not.toHaveBeenCalled()
  })

  test.each([
    ['sans identifiants', null],
    ['au quota', { limite: true }],
    ['avec le scelle d une autre agence', 'autre'],
    ['avec un scelle abime', 'abime'],
  ])('n appelle pas Apimo %s', async (_cas, acces) => {
    if (acces === 'autre')
      (base.acces_apimo as Record<string, unknown>).jeton_scelle = scellerIdentifiantsApimo({
        agence: '99999999-9999-4999-8999-999999999999',
        ...FAUX_IDENTIFIANTS,
      })
    else if (acces === 'abime')
      (base.acces_apimo as Record<string, unknown>).jeton_scelle = 'A'.repeat(120)
    else base.acces_apimo = acces
    expect((await ouverture()).statut).toBe('erreur')
    expect(faux.recues).toHaveLength(0)
    expect(doubles.ouvrir).not.toHaveBeenCalled()
    if (acces === 'autre' || acces === 'abime')
      expect(appels('noter_apimo')[0]![1]).toEqual({ le_resultat: 'secret' })
  })

  test('ferme, le connecteur n ouvre rien', async () => {
    delete process.env.CONNECTEUR_APIMO
    expect((await ouverture()).statut).toBe('erreur')
    expect(doubles.rpc).not.toHaveBeenCalled()
    expect(faux.recues).toHaveLength(0)
  })

  test('un bien qui n est pas dans les biens a louer de l agence n ouvre rien', async () => {
    expect((await ouverture({ bien: '999' })).statut).toBe('erreur')
    faux.biens = [bienFictif(12, { category: 1 })]
    expect((await ouverture()).statut).toBe('erreur')
    expect(doubles.ouvrir).not.toHaveBeenCalled()
    expect(appels('logement_du_bien_apimo')).toHaveLength(0)
  })

  test('une panne d Apimo se note et n ouvre rien', async () => {
    faux.prochaine({ statut: 401 })
    expect((await ouverture()).statut).toBe('erreur')
    expect(appels('noter_apimo')[0]![1]).toEqual({ le_resultat: 'refus' })
    expect(doubles.ouvrir).not.toHaveBeenCalled()
  })

  test('ouvre le dossier avec le libelle et le prix relus chez Apimo, puis le relie', async () => {
    expect(await ouverture({ bail: 'B-2026/014', langueLocataire: 'en' })).toEqual({
      statut: 'ouvert',
      email: 'locataire@exemple.fr',
    })
    expect(appels('logement_du_bien_apimo')[0]![1]).toEqual({
      le_bien: '12',
      le_libelle: 'T2 Croix-Rousse (LOC-12), 69004 Lyon',
      le_loyer_cents: 85000,
    })
    expect(doubles.ouvrir).toHaveBeenCalledWith('locataire@exemple.fr', expect.anything())
    expect(doubles.maj).toHaveBeenCalledWith(
      { logement_id: logement, loyer_cents: 85000 },
      'id',
      dossier,
    )
    expect(appels('lier_dossier_apimo')[0]![1]).toEqual({
      le_dossier: dossier,
      le_bien: '12',
      le_bail: 'B-2026/014',
    })
    expect(doubles.langue).toHaveBeenCalledWith(dossier, 'locataire', 'en')
    expect(doubles.livrer).toHaveBeenCalledWith(dossier)
    expect(appels('noter_apimo')[0]![1]).toEqual({ le_resultat: 'ok' })
    // Rien d'ecrit chez Apimo a l'ouverture : une seule lecture.
    expect(faux.recues.map((r) => r.methode)).toEqual(['GET'])
  })

  test('le loyer saisi prime, et un bien sans prix laisse le loyer au locataire', async () => {
    await ouverture({ loyer: '910,50' })
    expect(doubles.maj).toHaveBeenLastCalledWith(
      { logement_id: logement, loyer_cents: 91050 },
      'id',
      dossier,
    )
    await ouverture({ bien: '13' })
    expect(doubles.maj).toHaveBeenLastCalledWith({ logement_id: logement }, 'id', dossier)
    expect(appels('lier_dossier_apimo').at(-1)![1]).toMatchObject({ le_bien: '13', le_bail: null })
  })

  test('sans logement ou sans dossier, rien n est relie', async () => {
    base.logement_du_bien_apimo = null
    expect((await ouverture()).statut).toBe('erreur')
    expect(doubles.ouvrir).not.toHaveBeenCalled()
    base.logement_du_bien_apimo = logement
    doubles.ouvrir.mockResolvedValue(null)
    expect((await ouverture()).statut).toBe('erreur')
    expect(appels('lier_dossier_apimo')).toHaveLength(0)
  })

  test('un lien ou un complement refuse laisse le dossier ouvert et le dit', async () => {
    base.lier_dossier_apimo = false
    expect(await ouverture()).toEqual({
      statut: 'ouvert',
      email: 'locataire@exemple.fr',
      incomplet: true,
    })
    base.lier_dossier_apimo = true
    doubles.maj.mockResolvedValue({ error: { message: 'prive' } })
    expect(await ouverture()).toMatchObject({ statut: 'ouvert', incomplet: true })
    expect(doubles.livrer).toHaveBeenCalledTimes(2)
  })
})
