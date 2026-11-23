import { beforeEach, expect, test, vi } from 'vitest'

import { oublierCertificats } from '@/lib/2ddoc/confiance'
import { verifierCode2dDoc } from '@/lib/2ddoc/verification'
import { verification2dDoc } from '@/lib/2ddoc/resultat'
import { AUTORITES, type Autorite } from '@/lib/2ddoc/autorites'
import fixture from './fixtures/2ddoc.json'

/**
 * La seule reponse qui engage est « authentique » : chaque essai de refus
 * part du code valide et n'en change qu'une chose.
 */
const autorites: Record<string, Autorite> = Object.fromEntries(
  Object.entries(fixture.autorites).map(([code, certificat]) => [
    code,
    {
      nom: 'Autorite fictive',
      adresse: `http://${code.toLowerCase()}.invalid/pki-2ddoc.der`,
      parNom: true,
      empreinte: '',
      certificat,
    },
  ]),
)
const certificats: Record<string, string> = fixture.certificats
const telecharger = vi.fn(async (adresse: string) => {
  const identifiant = new URL(adresse).searchParams.get('name') ?? ''
  return Object.hasOwn(certificats, identifiant)
    ? Buffer.from(certificats[identifiant]!, 'base64')
    : null
})
const maintenant = new Date('2025-08-15T12:00:00Z')
const verifier = (code: Buffer, options = {}) =>
  verifierCode2dDoc(code, { telecharger, autorites, maintenant, ...options })
const code = (nom: keyof typeof fixture.codes) => Buffer.from(fixture.codes[nom], 'base64')
const NON_ETABLI = { etat: 'non_verifiable', motif: 'non_etabli' }

beforeEach(() => {
  oublierCertificats()
  telecharger.mockClear()
})

test('un avis signe par un emetteur de l autorite est authentique, valeurs a l appui', async () => {
  const resultat = await verifier(code('avis'))
  expect(resultat).toEqual({
    etat: 'authentique',
    emetteur: 'Emetteur fictif des impots',
    signeLe: '2025-07-31',
    valeurs: {
      annee: '2024',
      declarants: ['MME DUPONT MARIE', 'M DUPONT JEAN'],
      revenuFiscalDeReference: '31250',
      parts: '2.5',
      reference: '25B1234567890',
    },
  })
  expect(verification2dDoc.parse(resultat)).toEqual(resultat)
  expect(telecharger).toHaveBeenCalledExactlyOnceWith('http://zz01.invalid/pki-2ddoc.der?name=AV01')
})

test('une courbe P-384 est verifiee avec SHA-384', async () => {
  expect((await verifier(code('avisP384'))).etat).toBe('authentique')
})

test('un code authentique dont les champs ne se lisent pas reste authentique, sans valeur inventee', async () => {
  expect(await verifier(code('avisChampInconnu'))).toMatchObject({
    etat: 'authentique',
    valeurs: { annee: '2024' },
  })
})

test('une piece sans code lisible est non verifiable, pas suspecte', async () => {
  expect(await verifier(Buffer.alloc(0))).toEqual({ etat: 'non_verifiable', motif: 'aucun_code' })
  expect(telecharger).not.toHaveBeenCalled()
})

test('chaque octet signe compte : une valeur modifiee n est plus authentique', async () => {
  const original = code('avis')
  const position = original.indexOf('31250')
  expect(position).toBeGreaterThan(0)
  const modifie = Buffer.from(original)
  modifie[position] = '9'.charCodeAt(0)
  expect(await verifier(modifie)).toEqual(NON_ETABLI)
  // Et la signature elle-meme.
  const signature = Buffer.from(original)
  const dernier = signature.length - 3
  signature[dernier] = signature[dernier] === 0x41 ? 0x42 : 0x41
  expect(await verifier(signature)).toEqual(NON_ETABLI)
})

test.each([
  ['un certificat perime au jour de signature', 'perime'],
  ['un emetteur signe par une autre autorite', 'etranger'],
  ['un document date du futur', 'futur'],
  ['un 2D-Doc authentique qui n est pas un avis d imposition', 'facture'],
] as const)('%s est non verifiable', async (_nom, nom) => {
  expect(await verifier(code(nom))).toEqual(NON_ETABLI)
})

test.each([
  // Le meme code, la meme cle, mais l'autorite epinglee n'est pas celle qui a emis le certificat.
  [
    'une autre autorite',
    () => ({ ZZ01: { ...autorites.ZZ01!, certificat: autorites.ZZ02!.certificat } }),
  ],
  // Meme nom d'autorite, autre cle : le nom de l'emetteur concorde, pas la signature du certificat.
  [
    'une autorite homonyme',
    () => ({ ZZ01: { ...autorites.ZZ01!, certificat: autorites.HOMONYME!.certificat } }),
  ],
  ['aucune autorite', () => ({})],
  ['une autorite heritee du prototype', () => Object.create({ ZZ01: autorites.ZZ01 })],
])('une signature valide ne suffit pas avec %s', async (_nom, epinglees) => {
  expect(await verifier(code('avis'), { autorites: epinglees() })).toEqual(NON_ETABLI)
})

test('une cle RSA d emetteur, une reponse illisible ou une panne ne valident rien', async () => {
  const pourAv01 = (octets: Buffer | null) => ({ telecharger: async () => octets })
  expect(
    await verifier(code('avis'), pourAv01(Buffer.from(fixture.certificats.AV05, 'base64'))),
  ).toEqual(NON_ETABLI)
  oublierCertificats()
  expect(await verifier(code('avis'), pourAv01(Buffer.from('<html>erreur</html>')))).toEqual(
    NON_ETABLI,
  )
  oublierCertificats()
  expect(await verifier(code('avis'), pourAv01(null))).toEqual(NON_ETABLI)
})

test('une autorite sans publication par identifiant n est jamais interrogee', async () => {
  const sansNom = { ZZ01: { ...autorites.ZZ01!, parNom: false } }
  expect(await verifier(code('avis'), { autorites: sansNom })).toEqual(NON_ETABLI)
  expect(telecharger).not.toHaveBeenCalled()
})

test('le certificat est garde en memoire, un echec seulement dix minutes', async () => {
  vi.useFakeTimers({ now: maintenant })
  try {
    await verifier(code('avis'))
    await verifier(code('avis'))
    expect(telecharger).toHaveBeenCalledTimes(1)
    oublierCertificats()
    const panne = vi.fn(async () => null)
    await verifier(code('avis'), { telecharger: panne })
    await verifier(code('avis'), { telecharger: panne })
    expect(panne).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10 * 60_000 + 1)
    expect((await verifier(code('avis'))).etat).toBe('authentique')
  } finally {
    vi.useRealTimers()
  }
})

test('les autorites epinglees sont celles de la liste, empreintes comprises', async () => {
  const { X509Certificate } = await import('node:crypto')
  expect(Object.keys(AUTORITES).sort()).toEqual(['FR01', 'FR03', 'FR04', 'FR05', 'FR06', 'FR07'])
  for (const [code, autorite] of Object.entries(AUTORITES)) {
    const certificat = new X509Certificate(autorite.certificat)
    expect(certificat.fingerprint256.replaceAll(':', '').toLowerCase()).toBe(autorite.empreinte)
    expect(certificat.subject).toContain(`CN=${code}`)
    expect(certificat.ca).toBe(true)
    expect(autorite.parNom).toBe(autorite.adresse.endsWith('/pki-2ddoc.der'))
  }
})
