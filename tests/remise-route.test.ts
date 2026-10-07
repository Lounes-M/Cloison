import { randomUUID, createHash } from 'node:crypto'
import { beforeEach, expect, test, vi } from 'vitest'
import { POST } from '@/app/api/droits/remise/route'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), signer: vi.fn(), debit: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({
  clientServeur: async () => ({
    rpc: mocks.rpc,
    storage: { from: () => ({ createSignedUrl: mocks.signer }) },
  }),
}))
vi.mock('@/lib/droits/flux-remise', () => ({
  fluxRemise: async () =>
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([1]))
        c.close()
      },
    }),
}))
vi.mock('@/lib/acces/debit', () => ({ consommerDebit: mocks.debit }))
vi.mock('@/lib/env', () => ({ env: { supabaseUrl: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co' } }))
const entree = {
  id: randomUUID(),
  jeton: 'a'.repeat(43),
  preuve: 'b'.repeat(43),
  confirmer: false,
  telecharger: true,
}
const droit = () => {
  const expireLe = new Date(Date.now() + 60000).toISOString()
  return {
    id: entree.id,
    manifeste: {
      version: 1,
      demande: randomUUID(),
      revision: randomUUID(),
      decisionSha256: 'a'.repeat(64),
      destinataireSha256: 'b'.repeat(64),
      creeLe: new Date(Date.now() - 1000).toISOString(),
      expireLe,
      exclusions: [],
      fichiers: [{ nom: 'donnees-0001.txt', taille: 1, sha256: 'c'.repeat(64) }],
    },
    taille: 100,
    sha256: 'd'.repeat(64),
    expireLe,
    secondes: 30,
    recu: false,
  }
}
const requete = (corps: unknown = entree, origin = 'https://cloison.test') =>
  new Request('https://cloison.test/api/droits/remise', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.debit.mockResolvedValue(true)
  mocks.rpc.mockResolvedValue({ data: droit(), error: null })
  mocks.signer.mockResolvedValue({
    data: {
      signedUrl: `https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/object/sign/exports-droits/${entree.id}?token=${'a'.repeat(32)}`,
    },
    error: null,
  })
})
test('transmet seulement les empreintes des capacites et borne le bail Storage', async () => {
  expect((await POST(requete())).status).toBe(200)
  expect(mocks.rpc).toHaveBeenCalledWith('autoriser_remise_droits', {
    le_id: entree.id,
    le_jeton: createHash('sha256').update(entree.jeton).digest('hex'),
    la_preuve: createHash('sha256').update(entree.preuve).digest('hex'),
    confirmer: false,
  })
  expect(mocks.signer).toHaveBeenCalledWith(entree.id, 30)
})
test.each(['origine', 'champ', 'taille', 'quota', 'refus', 'expire', 'substitution', 'url'])(
  'refuse %s sans exposer de detail',
  async (cas) => {
    let r = requete()
    if (cas === 'origine') r = requete(entree, 'https://evil.test')
    if (cas === 'champ') r = requete({ ...entree, cle: 'ne-jamais-transmettre' })
    if (cas === 'taille') r = requete({ bruit: 'a'.repeat(2100) })
    if (cas === 'quota') mocks.debit.mockResolvedValue(false)
    if (cas === 'refus') mocks.rpc.mockResolvedValue({ data: null, error: null })
    if (cas === 'expire')
      mocks.rpc.mockResolvedValue({
        data: { ...droit(), expireLe: new Date(Date.now() - 1000).toISOString() },
        error: null,
      })
    if (cas === 'substitution')
      mocks.rpc.mockResolvedValue({ data: { ...droit(), id: randomUUID() }, error: null })
    if (cas === 'url')
      mocks.signer.mockResolvedValue({
        data: { signedUrl: 'https://evil.test/fichier' },
        error: null,
      })
    const reponse = await POST(r)
    expect(reponse.status).toBe(403)
    expect(reponse.headers.get('cache-control')).toBe('no-store')
    expect(await reponse.json()).toEqual({ erreur: 'Remise indisponible.' })
    if (cas !== 'url') expect(mocks.signer).not.toHaveBeenCalled()
  },
)
test('une confirmation ne produit aucun nouveau lien Storage', async () => {
  mocks.rpc.mockResolvedValue({ data: { ...droit(), recu: true }, error: null })
  expect(
    await (await POST(requete({ ...entree, confirmer: true, telecharger: false }))).json(),
  ).toEqual({ recu: true })
  expect(mocks.signer).not.toHaveBeenCalled()
})

test('le manifeste ne contient aucune URL Storage et ne cree pas de bail', async () => {
  const r = await POST(requete({ ...entree, telecharger: false }))
  expect(r.status).toBe(200)
  expect((await r.json()).url).toBeUndefined()
  expect(mocks.signer).not.toHaveBeenCalled()
})
