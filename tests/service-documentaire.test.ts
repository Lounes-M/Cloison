import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  signerDemande,
} from '@/lib/coffre/protocole-documentaire'
import { creerServiceDocumentaire } from '../scripts/service-documentaire.mjs'

const { executer } = vi.hoisted(() => ({ executer: vi.fn() }))
vi.mock('@/lib/coffre/processus-limite', () => ({ executerProcessus: executer }))
import { traiterDocument } from '@/lib/coffre/traitement-document'

const secret = 'secret-documentaire-exclusivement-fictif-0123456789'
const image = 'sha256:' + 'b'.repeat(64)
const pdf = Buffer.from('%PDF-1.7\nfixture de protocole')
const traiter = vi.fn<(entree: Buffer, image: string) => Promise<Buffer>>()
let etat = { actifs: 0, bloque: false }
let service: ReturnType<typeof creerServiceDocumentaire>
let base: string

beforeEach(async () => {
  executer.mockReset()
  traiter.mockReset()
  traiter.mockResolvedValue(Buffer.from('{"ok":true}'))
  etat = { actifs: 0, bloque: false }
  service = creerServiceDocumentaire({
    secret,
    image,
    traiter,
    etat: () => etat,
    sonderImage: async () => true,
    journal: () => {},
  })
  await new Promise<void>((r) => service.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(service.address() as AddressInfo).port}`
  expect(await service.verifierDisponibilite()).toBe(true)
  traiter.mockClear()
  vi.stubEnv('DOCUMENTAIRE_DISTANT_URL', base)
  vi.stubEnv('DOCUMENTAIRE_DISTANT_SECRET', secret)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  service.closeAllConnections()
  await new Promise((r) => service.close(r))
})

function envoyer(
  corps: Buffer,
  {
    horodatage = String(Date.now()),
    signature = signerDemande(secret, horodatage, corps),
  }: { horodatage?: string; signature?: string } = {},
) {
  return fetch(base + '/v1/traiter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [ENTETE_HORODATAGE]: horodatage,
      [ENTETE_SIGNATURE]: signature,
    },
    body: new Uint8Array(corps),
  })
}

test('le service distant remplace le processus local, demande et pagination identiques', async () => {
  traiter.mockResolvedValue(
    Buffer.from(JSON.stringify({ ok: true, pdf: pdf.toString('base64'), pages: 2 })),
  )
  expect(await traiterDocument(pdf, 'application/pdf', 'Agence', 'rasteriser', true)).toEqual({
    pdf,
    pages: 2,
  })
  expect(executer).not.toHaveBeenCalled()
  expect(traiter.mock.calls[0]![1]).toBe(image)
  expect(JSON.parse(traiter.mock.calls[0]![0].toString())).toEqual({
    operation: 'rasteriser',
    type: 'application/pdf',
    filigrane: 'Agence',
    contenu: pdf.toString('base64'),
    pagination: true,
  })
})

test('un refus bien forme du moteur garde le message de pages', async () => {
  traiter.mockResolvedValue(Buffer.from('{"ok":false,"pages":52}'))
  await expect(traiterDocument(pdf, 'application/pdf', '', 'verifier')).rejects.toThrow(
    'Ce document compte 52 pages',
  )
})

test('sans URL, le processus local reste utilise', async () => {
  vi.stubEnv('DOCUMENTAIRE_DISTANT_URL', '')
  vi.stubEnv('DOCUMENTAIRE_DISTANT_SECRET', '')
  executer.mockResolvedValue(Buffer.from('{"ok":true}'))
  await traiterDocument(pdf, 'application/pdf', '', 'verifier')
  expect(executer).toHaveBeenCalledOnce()
  expect(traiter).not.toHaveBeenCalled()
})

for (const [url, cle] of [
  ['http://documentaire.exemple.fr', secret],
  ['https://jean:motdepasse@documentaire.exemple.fr', secret],
  ['pas une url', secret],
  ['https://documentaire.exemple.fr', 'court'],
  ['', secret],
]) {
  test(`configuration invalide refusee sans repli local : ${url || 'secret seul'}`, async () => {
    vi.stubEnv('DOCUMENTAIRE_DISTANT_URL', url)
    vi.stubEnv('DOCUMENTAIRE_DISTANT_SECRET', cle)
    await expect(traiterDocument(pdf, 'application/pdf', '', 'verifier')).rejects.toThrow(
      'Moteur documentaire indisponible',
    )
    expect(executer).not.toHaveBeenCalled()
  })
}

test('une reponse alteree ou non liee a la demande est refusee', async () => {
  const vraiFetch = globalThis.fetch
  vi.stubGlobal('fetch', async (...args: Parameters<typeof fetch>) => {
    const reponse = await vraiFetch(...args)
    const corps = Buffer.from(await reponse.arrayBuffer())
    corps[2] = 'X'.charCodeAt(0)
    return new Response(corps, { status: 200, headers: reponse.headers })
  })
  await expect(traiterDocument(pdf, 'application/pdf', '', 'verifier')).rejects.toThrow(
    'Moteur documentaire indisponible',
  )
})

test('refuse signature fausse, horodatage perime et rejeu avant tout traitement', async () => {
  const corps = Buffer.from('{"operation":"verifier"}')
  expect((await envoyer(corps, { signature: 'a'.repeat(64) })).status).toBe(401)
  const ancien = String(Date.now() - 120_000)
  expect((await envoyer(corps, { horodatage: ancien })).status).toBe(401)
  const horodatage = String(Date.now())
  expect((await envoyer(corps, { horodatage })).status).toBe(200)
  expect((await envoyer(corps, { horodatage })).status).toBe(409)
  expect(traiter).toHaveBeenCalledOnce()
})

test('refuse une autre route, une autre methode et un corps absent', async () => {
  expect((await fetch(base + '/v1/autre')).status).toBe(404)
  expect((await fetch(base + '/v1/traiter')).status).toBe(405)
  expect((await envoyer(Buffer.alloc(0))).status).toBe(413)
  expect(traiter).not.toHaveBeenCalled()
})

test('distingue demande invalide, echec du conteneur et nettoyage bloque', async () => {
  traiter.mockRejectedValueOnce(new Error('Demande documentaire invalide'))
  expect((await envoyer(Buffer.from('{}'))).status).toBe(400)
  traiter.mockRejectedValueOnce(new Error('Commande documentaire refusee'))
  await expect(traiterDocument(pdf, 'application/pdf', '', 'verifier')).rejects.toThrow(
    'Document refuse par le moteur',
  )
  traiter.mockImplementationOnce(async () => {
    etat.bloque = true
    throw new Error('Nettoyage documentaire non confirme')
  })
  await expect(traiterDocument(pdf, 'application/pdf', '', 'verifier')).rejects.toThrow(
    'Traitement occupe',
  )
  const sante = await fetch(base + '/sante')
  expect(sante.status).toBe(503)
  expect(await sante.json()).toEqual({ etat: 'bloque' })
  traiter.mockClear()
  expect((await envoyer(Buffer.from('{}'))).status).toBe(503)
  expect(traiter).not.toHaveBeenCalled()
})

test('deux traitements a la fois, une file courte, puis refus de saturation', async () => {
  const liberations: Array<() => void> = []
  traiter.mockImplementation(
    () =>
      new Promise((r) => {
        liberations.push(() => r(Buffer.from('{"ok":true}')))
      }),
  )
  const envois = Array.from({ length: 11 }, (_, i) => envoyer(Buffer.from(`{"n":${i}}`)))
  await vi.waitFor(() => expect(traiter).toHaveBeenCalledTimes(2))
  const saturee = await Promise.race(envois)
  expect(saturee.status).toBe(503)
  while (liberations.length) {
    liberations.shift()!()
    await new Promise((r) => setTimeout(r, 10))
  }
  const statuts = (await Promise.all(envois)).map((r) => r.status).sort()
  expect(statuts.filter((s) => s === 200)).toHaveLength(10)
  expect(traiter).toHaveBeenCalledTimes(10)
})

test('sante : indisponible tant que l auto-test du conteneur echoue', async () => {
  expect(await (await fetch(base + '/sante')).json()).toEqual({ etat: 'pret' })
  traiter.mockResolvedValueOnce(Buffer.from('{"ok":false,"pages":null}'))
  expect(await service.verifierDisponibilite()).toBe(false)
  expect((await fetch(base + '/sante')).status).toBe(503)
  expect((await envoyer(Buffer.from('{}'))).status).toBe(503)
  expect((await fetch(base + '/vivant')).status).toBe(200)
})

test('refuse un secret court ou une image mutable au demarrage', () => {
  expect(() => creerServiceDocumentaire({ secret: 'court', image })).toThrow('Secret')
  expect(() => creerServiceDocumentaire({ secret, image: 'node:latest' })).toThrow('Image')
})
