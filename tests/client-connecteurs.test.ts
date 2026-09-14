import { afterEach, expect, test, vi } from 'vitest'
import { lireTousLesStatuts } from '../scripts/lire-statuts-connecteur.mjs'

const cle = 'cloison_read_' + 'a'.repeat(43)

test('le budget global reste partage entre les pages', async () => {
  const budget = new AbortController()
  const delais = vi
    .spyOn(AbortSignal, 'timeout')
    .mockImplementation((ms) => (ms === 30000 ? budget.signal : new AbortController().signal))
  let numero = 0
  const requete = vi.fn().mockImplementation(async () => {
    const liste = dossiers(numero++ * 50)
    if (numero === 3) budget.abort()
    return reponse(liste, liste.at(-1)!.reference)
  })
  await expect(lireTousLesStatuts(cle, { requete })).rejects.toMatchObject({ code: 'interrompu' })
  expect(delais.mock.calls.map(([ms]) => ms)).toEqual([30000, 10000, 10000, 10000])
  expect(requete).toHaveBeenCalledTimes(3)
})
const dossiers = (debut = 0, nombre = 50) =>
  Array.from({ length: nombre }, (_, i) => ({
    reference: `REF-${String(debut + i).padStart(8, '0')}`,
    etat: 'pret',
  }))
const reponse = (liste = dossiers(0, 1), suite: string | null = null) =>
  new Response(JSON.stringify({ version: 1, dossiers: liste, suite }), {
    headers: { 'content-type': 'application/json' },
  })
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test('lit toutes les pages depuis l origine fixe et rend un seul resultat complet', async () => {
  const premiere = dossiers()
  const requete = vi
    .fn()
    .mockResolvedValueOnce(reponse(premiere, premiere.at(-1)!.reference))
    .mockResolvedValueOnce(reponse(dossiers(50, 1)))
  const resultat = await lireTousLesStatuts(cle, { requete })
  expect(resultat.dossiers).toEqual([...premiere, ...dossiers(50, 1)])
  expect(resultat.pages).toBe(2)
  expect(Date.parse(resultat.termineLe)).toBeGreaterThanOrEqual(Date.parse(resultat.debutLe))
  expect(requete.mock.calls.map(([url]) => url)).toEqual([
    'https://www.cloison.immo/api/connecteurs/v1/dossiers',
    'https://www.cloison.immo/api/connecteurs/v1/dossiers?apres=REF-00000049',
  ])
  expect(requete.mock.calls[0]![1]).toMatchObject({
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${cle}` },
  })
})
test('une premiere page vide valide est un succes distinct d une panne', async () => {
  expect(
    (await lireTousLesStatuts(cle, { requete: vi.fn().mockResolvedValue(reponse([])) })).dossiers,
  ).toEqual([])
})

test('refuse une reponse non JSON et annule son corps', async () => {
  const annuler = vi.fn()
  const corps = new ReadableStream({ cancel: annuler })
  await expect(
    lireTousLesStatuts(cle, {
      requete: vi
        .fn()
        .mockResolvedValue(new Response(corps, { headers: { 'content-type': 'text/html' } })),
    }),
  ).rejects.toMatchObject({ code: 'reponse_invalide' })
  expect(annuler).toHaveBeenCalledOnce()
})

test('refuse une reponse provenant d une redirection', async () => {
  const r = reponse()
  Object.defineProperty(r, 'redirected', { value: true })
  await expect(
    lireTousLesStatuts(cle, { requete: vi.fn().mockResolvedValue(r) }),
  ).rejects.toMatchObject({ code: 'reponse_invalide' })
})
test.each(['', cle + '\n', 'secret-prive'])(
  'refuse une cle invalide avant reseau',
  async (valeur) => {
    const requete = vi.fn()
    await expect(lireTousLesStatuts(valeur, { requete })).rejects.toMatchObject({
      code: 'configuration',
    })
    expect(requete).not.toHaveBeenCalled()
  },
)
test.each([401, 429, 503, 500])(
  'une erreur %s apres une page ne rend jamais les premiers dossiers',
  async (status) => {
    const premiere = dossiers()
    const annuler = vi.fn()
    const requete = vi
      .fn()
      .mockResolvedValueOnce(reponse(premiere, premiere.at(-1)!.reference))
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel: annuler }), {
          status,
          headers: { 'retry-after': '60' },
        }),
      )
    await expect(lireTousLesStatuts(cle, { requete })).rejects.toMatchObject({
      code: status === 401 ? 'non_autorise' : status === 429 ? 'limite' : 'indisponible',
      reessayerApres: status === 429 ? 60 : null,
    })
    expect(requete).toHaveBeenCalledTimes(2)
    expect(annuler).toHaveBeenCalledOnce()
  },
)
test.each(['secret-prive', '-2', '99999'])(
  'ne reflete pas un Retry-After invalide',
  async (attente) => {
    const requete = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429, headers: { 'retry-after': attente } }))
    await expect(lireTousLesStatuts(cle, { requete })).rejects.toMatchObject({
      code: 'limite',
      reessayerApres: null,
    })
  },
)
test.each([
  { version: 1, dossiers: [{ reference: 'REF-00000000', etat: 'pret', revenu: 100 }], suite: null },
  { version: 2, dossiers: [], suite: null },
  { version: 1, dossiers: dossiers(0, 51), suite: null },
  { version: 1, dossiers: [{ reference: 'REF-00000000', etat: 'inconnu' }], suite: null },
])('refuse un contrat divergent sans propager ses donnees', async (corps) => {
  const requete = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(corps), { headers: { 'content-type': 'application/json' } }),
    )
  await expect(lireTousLesStatuts(cle, { requete })).rejects.toMatchObject({
    code: 'reponse_invalide',
  })
})
test.each([
  reponse(dossiers(0, 1), 'REF-00000000'),
  reponse(dossiers(), 'REF-inconnue'),
  reponse([dossiers(0, 1)[0]!, dossiers(0, 1)[0]!]),
])('refuse une pagination incoherente', async (r) => {
  await expect(
    lireTousLesStatuts(cle, { requete: vi.fn().mockResolvedValue(r) }),
  ).rejects.toMatchObject({ code: 'pagination_invalide' })
})
test('une boucle ou une reference repetee entre pages est refusee', async () => {
  const requete = vi.fn().mockImplementation(async () => reponse(dossiers(), 'REF-00000049'))
  await expect(lireTousLesStatuts(cle, { requete })).rejects.toMatchObject({
    code: 'pagination_invalide',
  })
  expect(requete).toHaveBeenCalledTimes(2)
})
test.each([true, false])(
  'cinquante pages : accepte uniquement un parcours termine (%s)',
  async (termine) => {
    let numero = 0
    const requete = vi.fn().mockImplementation(async () => {
      const liste = dossiers(numero++ * 50)
      return reponse(liste, termine && numero === 50 ? null : liste.at(-1)!.reference)
    })
    const lecture = lireTousLesStatuts(cle, { requete })
    if (termine) expect((await lecture).dossiers).toHaveLength(2500)
    else await expect(lecture).rejects.toMatchObject({ code: 'volume_excessif' })
    expect(requete).toHaveBeenCalledTimes(50)
  },
)
test('encode le curseur comme donnee sans modifier la destination', async () => {
  const premiere = dossiers()
  premiere[49]!.reference = 'ref/&?=#% +'
  const requete = vi
    .fn()
    .mockResolvedValueOnce(reponse(premiere, premiere[49]!.reference))
    .mockResolvedValueOnce(reponse([]))
  await lireTousLesStatuts(cle, { requete })
  const url = new URL(requete.mock.calls[1]![0])
  expect(url.origin).toBe('https://www.cloison.immo')
  expect([...url.searchParams]).toEqual([['apres', premiere[49]!.reference]])
})
test('refuse une reponse excessive et interrompt la lecture', async () => {
  const annuler = vi.fn()
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(65537))
    },
    cancel: annuler,
  })
  await expect(
    lireTousLesStatuts(cle, {
      requete: vi
        .fn()
        .mockResolvedValue(new Response(body, { headers: { 'content-type': 'application/json' } })),
    }),
  ).rejects.toMatchObject({ code: 'reponse_invalide' })
  expect(annuler).toHaveBeenCalledOnce()
})
test('une annulation deja demandee interdit le premier appel', async () => {
  const requete = vi.fn()
  await expect(
    lireTousLesStatuts(cle, { requete, signal: AbortSignal.abort() }),
  ).rejects.toMatchObject({ code: 'interrompu' })
  expect(requete).not.toHaveBeenCalled()
})
test('le delai couvre un corps qui reste ouvert', async () => {
  const controleur = new AbortController(),
    annuler = vi.fn()
  const requete = vi.fn().mockImplementation(async () => {
    queueMicrotask(() => controleur.abort())
    return new Response(new ReadableStream({ cancel: annuler }), {
      headers: { 'content-type': 'application/json' },
    })
  })
  await expect(
    lireTousLesStatuts(cle, { requete, signal: controleur.signal }),
  ).rejects.toMatchObject({ code: 'interrompu' })
  expect(annuler).toHaveBeenCalledOnce()
})
