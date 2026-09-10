import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { CompactSign, exportJWK, generateKeyPair, type JWK } from 'jose'
import { creerVerificateurUniversign } from '@/lib/signature/universign'

let paire: Awaited<ReturnType<typeof generateKeyPair>>
let autre: Awaited<ReturnType<typeof generateKeyPair>>
let publique: JWK
const reseau = vi.fn()
beforeAll(async () => {
  paire = await generateKeyPair('PS256')
  autre = await generateKeyPair('PS256')
  publique = { ...(await exportJWK(paire.publicKey)), kid: 'scd_fixture', use: 'sig' }
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  reseau.mockReset()
})
const objet = (etat = 'completed', type = 'transaction.lifecycle.completed') => ({
  object: 'event',
  id: 'evt_fixture',
  type,
  createdAt: Date.now() / 1000,
  payload: {
    object: {
      object: 'transaction',
      id: 'tx_fixture',
      state: etat,
      participants: [{ email: 'CONFIDENTIEL@example.invalid' }],
      metadata: { dossier: 'voisin' },
    },
  },
})
const corps = (valeur: unknown = objet()) => Buffer.from(JSON.stringify(valeur, null, 2))
async function signer(
  octets: Uint8Array,
  entete: Record<string, unknown> = {},
  cle = paire.privateKey,
) {
  const signe = await new CompactSign(octets)
    .setProtectedHeader({ alg: 'PS256', kid: 'scd_fixture', ...entete })
    .sign(cle)
  const [debut, , fin] = signe.split('.')
  return `${debut}..${fin}`
}
function preparer() {
  reseau.mockImplementation(async () => Response.json({ keys: [publique] }))
  vi.stubGlobal('fetch', reseau)
  return creerVerificateurUniversign('alpha')
}

test.each([
  ['created', 'draft'],
  ['started', 'started'],
  ['paused', 'paused'],
  ['cancelled', 'cancelled'],
  ['expired', 'expired'],
  ['completed', 'completed'],
])(
  'la notification %s est authentifiee sans propager les donnees personnelles',
  async (nom, etat) => {
    const verifier = preparer(),
      evenement = objet(etat, `transaction.lifecycle.${nom}`),
      octets = corps(evenement)
    const resultat = await verifier(octets, await signer(octets))
    expect(resultat).toEqual({
      evenement: 'evt_fixture',
      transaction: 'tx_fixture',
      etat,
      creeLe: evenement.createdAt,
    })
    expect(JSON.stringify(resultat)).not.toMatch(/CONFIDENTIEL|voisin|participants/)
    expect(reseau).toHaveBeenCalledWith(
      'https://api.alpha.universign.com/v1/webhooks/jwks.json',
      expect.objectContaining({ method: 'GET', redirect: 'manual', cache: 'no-store' }),
    )
    expect(new Headers(reseau.mock.calls[0][1].headers).has('authorization')).toBe(false)
  },
)

test('modifier les octets ou utiliser une autre cle ne peut pas authentifier un evenement', async () => {
  const verifier = preparer(),
    octets = corps(),
    signature = await signer(octets)
  expect(
    await verifier(Buffer.from(JSON.stringify(JSON.parse(octets.toString()))), signature),
  ).toBeNull()
  expect(
    await verifier(corps(objet('cancelled', 'transaction.lifecycle.cancelled')), signature),
  ).toBeNull()
  expect(await verifier(octets, await signer(octets, {}, autre.privateKey))).toBeNull()
})

test.each([
  { jku: 'https://attaquant.example.invalid/cles' },
  { jwk: {} },
  { b64: false },
  { crit: ['inconnu'] },
])('un parametre de cle ou encodage non prevu est refuse avant le reseau', async (supplement) => {
  preparer()
  const entete = Buffer.from(
    JSON.stringify({ alg: 'PS256', kid: 'scd_fixture', ...supplement }),
  ).toString('base64url')
  expect(await creerVerificateurUniversign('alpha')(corps(), `${entete}..AAAA`)).toBeNull()
  expect(reseau).not.toHaveBeenCalled()
})

test.each([null, '', 'a.b.c', 'a..b..c', 'a..b=', 'x'.repeat(6145)])(
  'la signature mal formee est refusee',
  async (signature) => {
    const verifier = preparer()
    expect(await verifier(corps(), signature)).toBeNull()
    expect(reseau).not.toHaveBeenCalled()
  },
)

test('un corps trop gros est refuse meme signe correctement', async () => {
  const verifier = preparer(),
    octets = Buffer.concat([corps(), Buffer.alloc(65536, 32)])
  expect(await verifier(octets, await signer(octets))).toBeNull()
  expect(reseau).not.toHaveBeenCalled()
})

test('seul PS256 est accepte', async () => {
  const verifier = preparer(),
    octets = corps()
  const autreAlgorithme = await generateKeyPair('RS256')
  reseau.mockImplementation(async () =>
    Response.json({
      keys: [{ ...(await exportJWK(autreAlgorithme.publicKey)), kid: 'scd_fixture' }],
    }),
  )
  const jws = await new CompactSign(octets)
    .setProtectedHeader({ alg: 'RS256', kid: 'scd_fixture' })
    .sign(autreAlgorithme.privateKey)
  const [debut, , fin] = jws.split('.')
  expect(await verifier(octets, `${debut}..${fin}`)).toBeNull()
})

test.each([
  () => ({ ...objet(), id: '../../autre' }),
  () => ({ ...objet(), createdAt: Date.now() / 1000 + 1000 }),
  () => ({ ...objet(), createdAt: 'maintenant' }),
  () => objet('closed'),
  () => objet('completed', 'action.closed'),
  () => ({
    ...objet(),
    payload: { object: { object: 'transaction', id: 'autre', state: 'completed' } },
  }),
])('un evenement authentique mais hors contrat est refuse', async (fabriquer) => {
  const verifier = preparer(),
    octets = corps(fabriquer())
  expect(await verifier(octets, await signer(octets))).toBeNull()
})

test('un renvoi ancien reste authentifiable sans promettre une protection contre le rejeu', async () => {
  const verifier = preparer(),
    octets = corps({ ...objet(), createdAt: Date.now() / 1000 - 7 * 86400 })
  expect(await verifier(octets, await signer(octets))).not.toBeNull()
})

test('un JSON ou UTF-8 invalide reste refuse apres authentification', async () => {
  const verifier = preparer()
  const invalide = Buffer.from(corps().toString().replace('CONFIDENTIEL', 'X'))
  invalide[invalide.indexOf(Buffer.from('X@example'))] = 255
  for (const octets of [Buffer.from('{invalide'), invalide])
    expect(await verifier(octets, await signer(octets))).toBeNull()
})

test('les environnements ont des caches et origines distincts', async () => {
  const verifier = preparer(),
    octets = corps(),
    signature = await signer(octets)
  expect(await verifier(octets, signature)).not.toBeNull()
  expect(await creerVerificateurUniversign('production')(octets, signature)).not.toBeNull()
  expect(reseau.mock.calls.map((c) => c[0])).toEqual([
    'https://api.alpha.universign.com/v1/webhooks/jwks.json',
    'https://api.universign.com/v1/webhooks/jwks.json',
  ])
})

test('le cache limite les lectures et accepte une rotation apres refroidissement', async () => {
  const verifier = preparer(),
    octets = corps(),
    signature = await signer(octets)
  expect(await verifier(octets, signature)).not.toBeNull()
  expect(await verifier(octets, signature)).not.toBeNull()
  const nouvelle = await signer(octets, { kid: 'scd_suivante' })
  expect(await verifier(octets, nouvelle)).toBeNull()
  expect(reseau).toHaveBeenCalledTimes(1)
  const plusTard = Date.now() + 31000
  vi.spyOn(Date, 'now').mockReturnValue(plusTard)
  reseau.mockImplementation(async () =>
    Response.json({ keys: [{ ...publique, kid: 'scd_suivante' }] }),
  )
  expect(await verifier(octets, nouvelle)).not.toBeNull()
  expect(reseau).toHaveBeenCalledTimes(2)
})

test.each(['redirection', 'longueur', 'octets', 'cles', 'json'])(
  'un jeu de cles %s invalide est refuse',
  async (cas) => {
    const verifier = preparer(),
      octets = corps(),
      signature = await signer(octets)
    const texte = JSON.stringify({ keys: [publique] })
    reseau.mockImplementation(async () => {
      if (cas === 'redirection')
        return new Response(texte, {
          status: 302,
          headers: { location: 'https://attaquant.example.invalid' },
        })
      if (cas === 'longueur') return new Response(texte, { headers: { 'content-length': '65537' } })
      if (cas === 'octets') return new Response(texte + ' '.repeat(65536))
      if (cas === 'cles')
        return Response.json({
          keys: Array.from({ length: 17 }, (_, i) => ({
            ...publique,
            kid: i ? `scd_autre${i}` : publique.kid,
          })),
        })
      return new Response('detail-prive')
    })
    expect(await verifier(octets, signature)).toBeNull()
    expect(reseau).toHaveBeenCalledTimes(1)
  },
)

test('une panne reseau est silencieuse et freine les nouvelles lectures', async () => {
  const verifier = preparer(),
    octets = corps(),
    signature = await signer(octets)
  const journal = vi.spyOn(console, 'error').mockImplementation(() => {})
  reseau.mockRejectedValue(new Error('detail-prive'))
  expect(await verifier(octets, signature)).toBeNull()
  expect(await verifier(octets, signature)).toBeNull()
  expect(reseau).toHaveBeenCalledTimes(1)
  expect(journal).not.toHaveBeenCalled()
})

test('le delai couvre aussi un corps de cles qui ne se termine pas', async () => {
  const verifier = preparer(),
    octets = corps(),
    signature = await signer(octets),
    annulation = vi.fn()
  reseau.mockResolvedValue(
    new Response(
      new ReadableStream({
        cancel() {
          annulation()
          return new Promise(() => {})
        },
      }),
    ),
  )
  const debut = Date.now()
  expect(await verifier(octets, signature)).toBeNull()
  expect(Date.now() - debut).toBeLessThan(5500)
  expect(annulation).toHaveBeenCalled()
})
