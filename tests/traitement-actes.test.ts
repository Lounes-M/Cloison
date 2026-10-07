import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({
  client: vi.fn(),
  rpc: vi.fn(),
  confirmer: vi.fn(),
  traiter: vi.fn(),
  charger: vi.fn(),
  rapprocher: vi.fn(),
  retirer: vi.fn(),
  config: vi.fn(),
}))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.client }))
vi.mock('@/lib/signature/parcours', () => ({ traiterActe: h.traiter, chargerActe: h.charger }))
vi.mock('@/lib/paiement/stripe', () => ({ rapprocherSessionActe: h.rapprocher }))
vi.mock('@/lib/signature/configuration-parcours', () => ({ configurationParcours: h.config }))
vi.mock('@/lib/signature/configuration-youtrust', () => ({ clientYoutrustConfigure: () => ({}) }))
import { POST as signature } from '@/app/api/signature/traitement/route'
import { POST as paiement } from '@/app/api/paiement/actes/rapprochement/route'
const requete = (secret = 'fictif') =>
  new Request('https://example.invalid', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('CRON_SECRET', 'fictif')
  vi.stubEnv('CRON_ACTES_SECRET', 'dedie')
  h.confirmer.mockResolvedValue({ data: true, error: null })
  h.config.mockReturnValue({ mode: 'sandbox' })
  vi.stubEnv('SIGNATURE_PARCOURS_ENABLED', 'false')
  vi.stubEnv('FACTURATION_ACTES_ENABLED', 'false')
  h.client.mockResolvedValue({
    rpc: (nom: string, ...args: unknown[]) =>
      nom === 'confirmer_traitement_actes' ? h.confirmer(nom, ...args) : h.rpc(nom, ...args),
    storage: { from: () => ({ remove: h.retirer }) },
  })
  h.rpc.mockImplementation(async (n) => ({
    data:
      n === 'expirer_archives_signature' ? 0 : n === 'fichiers_archives_a_supprimer' ? [] : null,
    error: null,
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
test.each([signature, paiement])(
  'une route refuse avant toute lecture sans secret',
  async (route) => {
    const r = await route(requete('autre'))
    expect(r.status).toBe(401)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(h.client).not.toHaveBeenCalled()
  },
)
test('la conservation continue quand les nouveaux parcours sont fermes', async () => {
  expect(await (await signature(requete())).json()).toEqual({
    actif: false,
    traites: 0,
    effaces: 0,
    echecs: 0,
  })
  expect(h.rpc).toHaveBeenCalledWith('expirer_archives_signature')
  expect(h.traiter).not.toHaveBeenCalled()
})
test('la fermeture de facturation interdit les appels Stripe', async () => {
  expect(await (await paiement(requete())).json()).toEqual({ actif: false, traites: 0, echecs: 0 })
  expect(h.rapprocher).not.toHaveBeenCalled()
  expect(h.rpc).not.toHaveBeenCalled()
  expect(h.confirmer).toHaveBeenCalledWith('confirmer_traitement_actes', {
    le_nom: 'reglements',
    reussite: true,
  })
})
test('une erreur de conservation reste un echec sans detail prive', async () => {
  h.rpc.mockRejectedValue(new Error('DOCUMENT_PRIVE'))
  const r = await signature(requete())
  expect(r.status).toBe(503)
  expect(JSON.stringify(await r.json())).not.toContain('DOCUMENT_PRIVE')
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('DOCUMENT_PRIVE')
})
test('le rapprochement bancaire echoue si une des sessions ne se confirme pas', async () => {
  vi.stubEnv('FACTURATION_ACTES_ENABLED', 'true')
  h.rpc.mockImplementation(async (n) => ({
    data:
      n === 'reglements_actes_a_rapprocher'
        ? [{ id: '11111111-1111-4111-8111-111111111111', session_ref: 'cs_fixture' }]
        : 0,
    error: null,
  }))
  h.rapprocher.mockRejectedValue(new Error('Panne privee'))
  const r = await paiement(requete())
  expect(r.status).toBe(503)
  expect(await r.json()).toEqual({ actif: true, traites: 0, echecs: 1 })
})

const premier = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222'
const second = '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333'
function fileSuppression(chemins: string[]) {
  h.rpc.mockImplementation(async (n) => ({
    data:
      n === 'fichiers_archives_a_supprimer'
        ? chemins
        : n === 'acquitter_suppression_archive'
          ? true
          : 0,
    error: null,
  }))
  h.retirer.mockResolvedValue({ error: null })
}
test.each(['storage', 'confirmation'])(
  'un echec %s conserve le fichier en file sans bloquer les autres',
  async (etape) => {
    fileSuppression([premier, second])
    if (etape === 'storage')
      h.retirer.mockResolvedValueOnce({ error: { message: 'DONNEE_PRIVEE' } })
    else
      h.rpc.mockImplementation(async (n, args) => ({
        data: n === 'fichiers_archives_a_supprimer' ? [premier, second] : true,
        error:
          n === 'acquitter_suppression_archive' && args.le_chemin === premier
            ? { message: 'DONNEE_PRIVEE' }
            : null,
      }))
    const r = await signature(requete())
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ actif: false, traites: 0, effaces: 1, echecs: 1 })
    expect(h.retirer.mock.calls).toEqual([[[premier]], [[second]]])
    expect(h.rpc).toHaveBeenCalledWith('acquitter_suppression_archive', { le_chemin: second })
    if (etape === 'storage')
      expect(h.rpc).not.toHaveBeenCalledWith('acquitter_suppression_archive', {
        le_chemin: premier,
      })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('DONNEE_PRIVEE')
  },
)
test('une interruption arrete les suppressions suivantes dans le meme budget', async () => {
  fileSuppression([premier, second])
  const c = new AbortController()
  h.retirer.mockImplementationOnce(async () => {
    c.abort()
    throw new Error('interruption')
  })
  const r = await signature(
    new Request('https://example.invalid', {
      method: 'POST',
      headers: { authorization: 'Bearer fictif' },
      signal: c.signal,
    }),
  )
  expect(r.status).toBe(503)
  expect(h.retirer).toHaveBeenCalledTimes(1)
  expect(h.rpc).not.toHaveBeenCalledWith('acquitter_suppression_archive', expect.anything())
})
test.each([
  [premier, premier],
  ['------------------------------------/------------------------------------'],
  ['../pieces/fichier'],
  Array(11).fill(premier),
])('une file invalide ne supprime aucun objet : %j', async (...chemins) => {
  fileSuppression(chemins as string[])
  const r = await signature(requete())
  expect(r.status).toBe(503)
  expect(h.retirer).not.toHaveBeenCalled()
})

test.each(['archives_connexion', 'archives_expiration', 'archives_file_suppression'])(
  'le diagnostic localise la panne sans son contenu : %s',
  async (etape) => {
    if (etape === 'archives_connexion') h.client.mockRejectedValueOnce(new Error('DETAIL_PRIVE'))
    else
      h.rpc.mockImplementation(async (n) => {
        if (
          n ===
          (etape === 'archives_expiration'
            ? 'expirer_archives_signature'
            : 'fichiers_archives_a_supprimer')
        )
          throw new Error('DETAIL_PRIVE')
        return { data: 0, error: null }
      })
    expect((await signature(requete())).status).toBe(503)
    expect(vi.mocked(console.error).mock.calls).toEqual(
      etape === 'archives_connexion'
        ? [[`[actes] echec ${etape}`]]
        : [
            [
              '[actes] transport en echec',
              etape === 'archives_expiration' ? 'expiration' : 'file',
              'appel_indisponible',
            ],
            [`[actes] echec ${etape}`],
          ],
    )
    expect(h.retirer).not.toHaveBeenCalled()
  },
)
test.each(['archives_suppression', 'archives_acquittement'])(
  'plusieurs fichiers en echec produisent un seul diagnostic par etape : %s',
  async (etape) => {
    fileSuppression([premier, second])
    if (etape === 'archives_suppression')
      h.retirer.mockRejectedValue(new Error(premier + ' SECRET'))
    else
      h.rpc.mockImplementation(async (n) => ({
        data: n === 'fichiers_archives_a_supprimer' ? [premier, second] : false,
        error: null,
      }))
    const r = await signature(requete())
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ actif: false, traites: 0, effaces: 0, echecs: 2 })
    expect(vi.mocked(console.error).mock.calls).toEqual([[`[actes] echec ${etape}`]])
  },
)
test('un succes reste silencieux', async () => {
  expect((await signature(requete())).status).toBe(200)
  expect(console.error).not.toHaveBeenCalled()
})

test.each([
  'actes_configuration',
  'actes_connexion',
  'actes_file',
  'actes_lecture',
  'actes_traitement',
  'actes_anomalies',
])('le parcours actif localise les echecs : %s', async (etape) => {
  vi.stubEnv('SIGNATURE_PARCOURS_ENABLED', 'true')
  const id = '11111111-1111-4111-8111-111111111111'
  h.rpc.mockImplementation(async (n) => {
    if (
      (etape === 'actes_file' && n === 'actes_a_traiter') ||
      (etape === 'actes_anomalies' && n === 'operations_actes_a_examiner')
    )
      throw new Error('DETAIL_PRIVE')
    return {
      data: n === 'fichiers_archives_a_supprimer' ? [] : n === 'actes_a_traiter' ? [id] : 0,
      error: null,
    }
  })
  h.charger.mockResolvedValue({ acte: { etape: 'en_cours' } })
  h.traiter.mockResolvedValue(undefined)
  if (etape === 'actes_configuration')
    h.config.mockImplementation(() => {
      throw new Error('CONFIG_PRIVEE')
    })
  if (etape === 'actes_connexion') {
    const client = await h.client()
    h.client.mockResolvedValueOnce(client).mockRejectedValueOnce(new Error('CONNEXION_PRIVEE'))
  }
  if (etape === 'actes_lecture') h.charger.mockRejectedValue(new Error('DOSSIER_PRIVE'))
  if (etape === 'actes_traitement') h.traiter.mockRejectedValue(new Error('FOURNISSEUR_PRIVE'))
  const r = await signature(requete())
  expect(r.status).toBe(503)
  expect(vi.mocked(console.error).mock.calls).toEqual([[`[actes] echec ${etape}`]])
  expect(JSON.stringify(await r.json())).not.toMatch(/PRIVE|11111111/)
})

const actes = Array.from(
  { length: 6 },
  (_, i) => `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
)
function fileActes(ids = actes) {
  vi.stubEnv('SIGNATURE_PARCOURS_ENABLED', 'true')
  vi.stubEnv('YOUTRUST_MUTATIONS_ENABLED', 'true')
  const attente = [...ids]
  h.rpc.mockImplementation(async (nom) => ({
    data:
      nom === 'fichiers_archives_a_supprimer'
        ? []
        : nom === 'actes_a_traiter'
          ? attente.splice(0, 1)
          : 0,
    error: null,
  }))
  h.charger.mockResolvedValue({ acte: { etape: 'en_cours' } })
  h.traiter.mockResolvedValue(undefined)
}
const selections = () => h.rpc.mock.calls.filter(([nom]) => nom === 'actes_a_traiter')

test('un lot avance cinq actes distincts sans reserver le sixieme', async () => {
  fileActes()
  const r = await signature(requete())
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ actif: true, traites: 5, effaces: 0, echecs: 0 })
  expect(h.traiter.mock.calls.map((c) => c[1])).toEqual(actes.slice(0, 5))
  expect(selections()).toHaveLength(5)
  expect(h.rpc).toHaveBeenCalledWith('operations_actes_a_examiner')
})

test.each(['lecture', 'traitement'])(
  'un echec de %s laisse avancer les actes suivants',
  async (etape) => {
    fileActes(actes.slice(0, 3))
    ;(etape === 'lecture' ? h.charger : h.traiter).mockRejectedValueOnce(new Error('PRIVE'))
    const r = await signature(requete())
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ actif: true, traites: 2, effaces: 0, echecs: 1 })
    expect(h.traiter.mock.calls.map((c) => c[1])).toContain(actes[2])
    expect(h.rpc).toHaveBeenCalledWith('operations_actes_a_examiner')
    expect(h.confirmer).toHaveBeenCalledWith('confirmer_traitement_actes', {
      le_nom: 'archives',
      reussite: false,
    })
  },
)

test('une selection vide termine le lot sans appel fournisseur', async () => {
  fileActes([])
  expect((await signature(requete())).status).toBe(200)
  expect(h.traiter).not.toHaveBeenCalled()
  expect(selections()).toHaveLength(1)
})

test('un acte reeligible dans le meme passage ne se rejoue pas', async () => {
  fileActes([actes[0]!, actes[0]!])
  const r = await signature(requete())
  expect(r.status).toBe(200)
  expect((await r.json()).traites).toBe(1)
  expect(h.traiter).toHaveBeenCalledTimes(1)
})

test('le budget ne reserve pas de nouvel acte apres trente secondes', async () => {
  fileActes()
  let temps = 0
  vi.spyOn(performance, 'now').mockImplementation(() => temps)
  h.traiter.mockImplementation(async () => {
    temps = 30000
  })
  const r = await signature(requete())
  expect(r.status).toBe(200)
  expect((await r.json()).traites).toBe(1)
  expect(selections()).toHaveLength(1)
  expect(h.rpc).toHaveBeenCalledWith('operations_actes_a_examiner')
})

test('une coupure pendant un acte interdit toute nouvelle reservation', async () => {
  fileActes()
  const controle = new AbortController()
  h.traiter.mockImplementationOnce(async () => {
    controle.abort()
    throw new Error('PRIVE')
  })
  const r = await signature(
    new Request('https://example.invalid', {
      method: 'POST',
      headers: { authorization: 'Bearer fictif' },
      signal: controle.signal,
    }),
  )
  expect(r.status).toBe(503)
  expect(selections()).toHaveLength(1)
  expect(h.traiter).toHaveBeenCalledTimes(1)
})

test('fermer les mutations laisse archiver les autres actes signes', async () => {
  fileActes(actes.slice(0, 2))
  vi.stubEnv('YOUTRUST_MUTATIONS_ENABLED', 'false')
  h.charger.mockResolvedValueOnce({ acte: { etape: 'valide' } })
  const r = await signature(requete())
  expect(r.status).toBe(200)
  expect(h.traiter.mock.calls.map((c) => c[1])).toEqual([actes[1]])
})

test('une panne de selection apres un succes arrete le lot et garde son compteur', async () => {
  fileActes()
  const implementation = h.rpc.getMockImplementation()!
  let passages = 0
  h.rpc.mockImplementation(async (nom, ...args) => {
    if (nom === 'actes_a_traiter' && ++passages === 2) throw new Error('PRIVE')
    return implementation(nom, ...args)
  })
  const r = await signature(requete())
  expect(r.status).toBe(503)
  expect(await r.json()).toEqual({ actif: true, traites: 1, effaces: 0, echecs: 1 })
  expect(h.traiter).toHaveBeenCalledTimes(1)
})

test('une coupure pendant la lecture interdit tout appel fournisseur', async () => {
  fileActes()
  const controle = new AbortController()
  h.charger.mockImplementationOnce(async () => {
    controle.abort()
    return { acte: { etape: 'en_cours' } }
  })
  const r = await signature(
    new Request('https://example.invalid', {
      method: 'POST',
      headers: { authorization: 'Bearer fictif' },
      signal: controle.signal,
    }),
  )
  expect(r.status).toBe(503)
  expect(h.traiter).not.toHaveBeenCalled()
  expect(selections()).toHaveLength(1)
})

test('tous les actes partagent le meme signal de delai et le meme mode', async () => {
  fileActes(actes.slice(0, 3))
  expect((await signature(requete())).status).toBe(200)
  const signal = h.client.mock.calls[1]![0]
  for (const appel of h.traiter.mock.calls) {
    expect(appel[2]).toBe('sandbox')
    expect(appel[4]).toBe(signal)
  }
})

test('une retention reprise ne rejoue aucun acte ni suppression Storage', async () => {
  h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'SECRET' }, status: 504 })
  const r = await signature(requete())
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ actif: false, traites: 0, effaces: 0, echecs: 0 })
  expect(h.rpc.mock.calls).toEqual([
    ['expirer_archives_signature'],
    ['expirer_archives_signature'],
    ['fichiers_archives_a_supprimer'],
  ])
  expect(h.traiter).not.toHaveBeenCalled()
  expect(h.retirer).not.toHaveBeenCalled()
})
