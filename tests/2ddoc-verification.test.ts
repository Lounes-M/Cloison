import { beforeEach, expect, test, vi } from 'vitest'

import { certificatsDans, emetteursDeConfiance, oublierCertificats } from '@/lib/2ddoc/confiance'
import { oublierListes, pointsDeDistribution } from '@/lib/2ddoc/revocation'
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
      recherches: [`http://${code.toLowerCase()}.invalid/pki-2ddoc.der?name={id}`],
      empreinte: '',
      certificat,
    },
  ]),
)
const certificats: Record<string, string> = fixture.certificats
const LISTE = 'http://crl.zz01.invalid/zz01.crl'
const liste = (nom: keyof typeof fixture.listes) => Buffer.from(fixture.listes[nom], 'base64')
const certificat = (nom: string) => Buffer.from(certificats[nom]!, 'base64')
/** L'autorite fictive : un certificat par identifiant, et sa liste de revocation. */
const publier = (revocation: Buffer | null = liste('valide')) =>
  async function (adresse: string) {
    if (adresse === LISTE) return revocation
    const identifiant = new URL(adresse).searchParams.get('name') ?? ''
    return Object.hasOwn(certificats, identifiant) ? certificat(identifiant) : null
  }
const telecharger = vi.fn(publier())
const maintenant = new Date('2025-08-15T12:00:00Z')
const verifier = (code: Buffer, options = {}) =>
  verifierCode2dDoc(code, { telecharger, autorites, maintenant, ...options })
const code = (nom: keyof typeof fixture.codes) => Buffer.from(fixture.codes[nom], 'base64')
const NON_ETABLI = { etat: 'non_verifiable', motif: 'non_etabli' }

beforeEach(() => {
  oublierCertificats()
  oublierListes()
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
  expect(telecharger.mock.calls.map(([adresse]) => adresse)).toEqual([
    'http://zz01.invalid/pki-2ddoc.der?name=AV01',
    LISTE,
  ])
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
  const pourAv01 = (octets: Buffer | null) => ({
    telecharger: async (adresse: string) => (adresse === LISTE ? liste('valide') : octets),
  })
  expect(await verifier(code('avis'), pourAv01(certificat('AV05')))).toEqual(NON_ETABLI)
  oublierCertificats()
  expect(await verifier(code('avis'), pourAv01(Buffer.from('<html>erreur</html>')))).toEqual(
    NON_ETABLI,
  )
  oublierCertificats()
  expect(await verifier(code('avis'), pourAv01(null))).toEqual(NON_ETABLI)
})

test('une autorite sans adresse de recherche n est jamais interrogee', async () => {
  const sansNom = { ZZ01: { ...autorites.ZZ01!, recherches: [] } }
  expect(await verifier(code('avis'), { autorites: sansNom })).toEqual(NON_ETABLI)
  expect(telecharger).not.toHaveBeenCalled()
})

test('le certificat est garde en memoire, un echec seulement dix minutes', async () => {
  vi.useFakeTimers({ now: maintenant })
  try {
    await verifier(code('avis'))
    await verifier(code('avis'))
    // Une fois le certificat, une fois la liste de revocation.
    expect(telecharger).toHaveBeenCalledTimes(2)
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
    // Chaque autorite se cherche chez elle, et d'abord par identifiant.
    expect(autorite.recherches[0]).toContain('{id}')
    for (const recherche of autorite.recherches)
      expect(new URL(recherche).host).toBe(new URL(autorite.adresse).host)
  }
})

/** Un annuaire a la maniere de Certigna : un message en plusieurs parties, un certificat par partie. */
const annuaire = (...noms: string[]) =>
  Buffer.concat(
    noms.flatMap((nom) => [
      Buffer.from('--End\r\nContent-Type: application/pkix-cert\r\n\r\n', 'latin1'),
      certificat(nom),
      Buffer.from('\r\n', 'latin1'),
    ]),
  )
const ANNUAIRE = 'http://zz01.invalid/annuaire'
const avecAnnuaire = {
  ZZ01: {
    ...autorites.ZZ01!,
    recherches: ['http://zz01.invalid/recherche?name={id}', ANNUAIRE],
  },
}

test('sans reponse par identifiant, le certificat est retrouve par son nom dans l annuaire', async () => {
  const servir = vi.fn(async (adresse: string) =>
    adresse === ANNUAIRE
      ? annuaire('AV04', 'AV02', 'AV01', 'AV06')
      : adresse === LISTE
        ? liste('valide')
        : null,
  )
  const options = { autorites: avecAnnuaire, telecharger: servir }
  expect(await verifier(code('avis'), options)).toMatchObject({
    etat: 'authentique',
    emetteur: 'Emetteur fictif des impots',
  })
  expect(servir.mock.calls.map(([adresse]) => adresse)).toEqual([
    'http://zz01.invalid/recherche?name=AV01',
    ANNUAIRE,
    LISTE,
  ])
  // Le certificat revoque de l'annuaire reste revoque.
  expect(await verifier(code('revoque'), options)).toEqual(NON_ETABLI)
})

test('un annuaire qui ne contient pas l emetteur nomme ne valide rien', async () => {
  // AV04 a signe `avisP384` ; presente sous un autre nom, il n'est pas retenu.
  const sousUnAutreNom = Buffer.from(code('avisP384'))
  sousUnAutreNom.write('AV01', 8, 'latin1')
  for (const contenu of [annuaire('AV04', 'AV02'), annuaire('AV04'), Buffer.from('--End\r\n')]) {
    oublierCertificats()
    const servir = async (adresse: string) =>
      adresse === ANNUAIRE ? contenu : adresse === LISTE ? liste('valide') : null
    const options = { autorites: avecAnnuaire, telecharger: servir }
    expect(await verifier(code('avis'), options)).toEqual(NON_ETABLI)
    expect(await verifier(sousUnAutreNom, options)).toEqual(NON_ETABLI)
  }
})

test('dans un annuaire, seul le certificat qui porte l identifiant est retenu', async () => {
  const jour = new Date('2025-07-31')
  const chercher = (identifiant: string, ...noms: string[]) =>
    emetteursDeConfiance('ZZ01', identifiant, jour, {
      autorites: avecAnnuaire,
      telecharger: async (adresse) => (adresse === ANNUAIRE ? annuaire(...noms) : null),
    })
  const trouves = await chercher('AV01', 'AV04', 'AV01', 'AV06')
  expect(trouves.map((e) => e.organisation)).toEqual(['Emetteur fictif des impots'])
  oublierCertificats()
  // Un seul certificat dans l'annuaire, valide mais d'un autre emetteur.
  expect(await chercher('AV01', 'AV04')).toEqual([])
  // AV03 porte le bon nom mais vient d'une autre autorite.
  expect(await chercher('AV03', 'AV03', 'AV01')).toEqual([])
})

test('une reponse par identifiant a plusieurs certificats est triee par nom, PEM compris', async () => {
  const { X509Certificate } = await import('node:crypto')
  const pem = ['AV04', 'AV01']
    .map((nom) => new X509Certificate(certificat(nom)).toString())
    .join('\n')
  expect(certificatsDans(Buffer.from(pem))).toHaveLength(2)
  const servir = async (adresse: string) => (adresse === LISTE ? liste('valide') : Buffer.from(pem))
  expect((await verifier(code('avis'), { telecharger: servir })).etat).toBe('authentique')
})

test('le certificat de l autorite elle-meme n est jamais pris pour celui d un emetteur', async () => {
  const servir = async (adresse: string) =>
    adresse === LISTE ? liste('valide') : Buffer.from(fixture.autorites.ZZ01)
  expect(await verifier(code('avis'), { telecharger: servir })).toEqual(NON_ETABLI)
})

test('un certificat revoque n est plus authentique, meme pour un document anterieur', async () => {
  expect(await verifier(code('revoque'))).toEqual(NON_ETABLI)
  // Le meme certificat sans consultation de la liste aurait suffi : la signature est juste.
  expect(telecharger).toHaveBeenCalledWith(LISTE, expect.any(Number))
})

test.each([
  ['injoignable', null],
  ['illisible', Buffer.from('<html>erreur</html>')],
  ['perimee', liste('perimee')],
  ['signee par une autorite homonyme', liste('homonyme')],
  ['limitee aux certificats d autorites', liste('autorites')],
  ['tronquee', liste('valide').subarray(0, 200)],
])('une liste de revocation %s n etablit rien', async (_nom, contenu) => {
  expect(await verifier(code('avis'), { telecharger: publier(contenu) })).toEqual(NON_ETABLI)
})

test('une liste dont un octet a change n est pas retenue', async () => {
  const modifiee = Buffer.from(liste('valide'))
  // Le numero du certificat revoque, dans le corps signe.
  const position = modifiee.indexOf(Buffer.from('02021008', 'hex'))
  expect(position).toBeGreaterThan(0)
  modifiee[position + 3] = 0x09
  expect(await verifier(code('revoque'), { telecharger: publier(modifiee) })).toEqual(NON_ETABLI)
  expect(await verifier(code('avis'), { telecharger: publier(modifiee) })).toEqual(NON_ETABLI)
})

test('sans liste nommee par le certificat, ou une fois le certificat echu, rien n est etabli', async () => {
  expect(await verifier(code('sansListe'))).toEqual(NON_ETABLI)
  // En 2028, le certificat de 2024-2026 est sorti des listes.
  expect(await verifier(code('avis'), { maintenant: new Date('2028-01-01') })).toEqual(NON_ETABLI)
})

test('la liste de revocation est relue au bout d une heure, un echec au bout de dix minutes', async () => {
  vi.useFakeTimers({ now: maintenant })
  try {
    const servir = vi.fn(publier())
    await verifier(code('avis'), { telecharger: servir })
    await verifier(code('avisChampInconnu'), { telecharger: servir })
    expect(servir.mock.calls.filter(([adresse]) => adresse === LISTE)).toHaveLength(1)
    vi.advanceTimersByTime(3_600_000 + 1)
    const panne = vi.fn(publier(null))
    expect(await verifier(code('avis'), { telecharger: panne })).toEqual(NON_ETABLI)
    expect(await verifier(code('avis'), { telecharger: servir })).toEqual(NON_ETABLI)
    vi.advanceTimersByTime(10 * 60_000 + 1)
    expect((await verifier(code('avis'), { telecharger: servir })).etat).toBe('authentique')
  } finally {
    vi.useRealTimers()
  }
})

test('les points de distribution se lisent sur de vrais certificats', async () => {
  const { X509Certificate } = await import('node:crypto')
  const points = (code: string) =>
    pointsDeDistribution(new X509Certificate(AUTORITES[code]!.certificat))
  expect(points('FR01')).toEqual([])
  expect(points('FR03')).toEqual([
    'http://crl.certigna.fr/certignarootca.crl',
    'http://crl.dhimyotis.com/certignarootca.crl',
  ])
  expect(points('FR06')).toEqual(['http://pki-g3.ariadnext.fr/arl-g3-root.crl'])
  expect(points('FR07')).toEqual([
    'http://pki2.sunnystamp.com/crls/sunnystamp-root-ca-g2.crl',
    'http://pki3.sunnystamp.com/crls/sunnystamp-root-ca-g2.crl',
  ])
})
