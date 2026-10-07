import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { creerPaquetDroits } from '../scripts/paquet-droits.mjs'
import { ouvrirRemise, preuveRemise, lireCleRemise, base64url } from '@/lib/droits/remise-format'
import { verifierUrlRemise } from '@/lib/droits/remise-url'

const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex')
function fixture() {
  const cle = randomBytes(32),
    contenu = Buffer.from('Donnees fictives uniquement.')
  const manifeste = {
    version: 1 as const,
    demande: randomUUID(),
    revision: randomUUID(),
    decisionSha256: 'a'.repeat(64),
    destinataireSha256: 'b'.repeat(64),
    creeLe: new Date(Date.now() - 1000).toISOString(),
    expireLe: new Date(Date.now() + 60000).toISOString(),
    exclusions: [],
    fichiers: [{ nom: 'donnees-0001.txt', taille: contenu.length, sha256: hash(contenu) }],
  }
  const archive = creerPaquetDroits(manifeste, new Map([['donnees-0001.txt', contenu]]), cle)
  return {
    cle,
    contenu,
    archive,
    attendu: {
      id: randomUUID(),
      manifeste,
      taille: archive.length,
      sha256: hash(archive),
      expireLe: manifeste.expireLe,
      secondes: 30,
      recu: false,
    },
  }
}
test('le navigateur ouvre le format chiffre produit par la CLI existante', async () => {
  const f = fixture()
  const fichiers = await ouvrirRemise(Uint8Array.from(f.archive), Uint8Array.from(f.cle), f.attendu)
  expect(Buffer.from(fichiers.get('donnees-0001.txt')!)).toEqual(f.contenu)
})
test.each(['cle', 'archive', 'destinataire', 'expiration', 'fichier', 'empreinte', 'taille'])(
  'refuse la substitution de %s',
  async (cas) => {
    const f = fixture()
    if (cas === 'cle') f.cle[0] = f.cle[0]! ^ 1
    if (cas === 'archive') f.archive[30] = f.archive[30]! ^ 1
    if (cas === 'destinataire') f.attendu.manifeste.destinataireSha256 = 'c'.repeat(64)
    if (cas === 'expiration') f.attendu.expireLe = new Date(Date.now() + 120000).toISOString()
    if (cas === 'fichier') f.attendu.manifeste.fichiers[0]!.nom = 'piece-0001.pdf'
    if (cas === 'empreinte') f.attendu.sha256 = 'd'.repeat(64)
    if (cas === 'taille') f.attendu.taille++
    await expect(
      ouvrirRemise(Uint8Array.from(f.archive), Uint8Array.from(f.cle), f.attendu),
    ).rejects.toThrow()
  },
)
test('la preuve est derivee par remise et ne revele pas la cle', async () => {
  const cle = Uint8Array.from(randomBytes(32)),
    id = randomUUID()
  const preuve = await preuveRemise(cle, id)
  expect(preuve).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(preuve).not.toBe(base64url(cle))
  expect(await preuveRemise(cle, id)).toBe(preuve)
  expect(await preuveRemise(cle, randomUUID())).not.toBe(preuve)
  expect(lireCleRemise(Buffer.from(cle).toString('base64'))).toEqual(cle)
  expect(() => lireCleRemise('a'.repeat(44))).toThrow()
})
test('encode plusieurs blocs sans erreur de pile ni bourrage intermediaire', () => {
  for (const taille of [0, 1, 2, 3, 24576, 24577, 500001]) {
    const b = randomBytes(taille)
    expect(base64url(b)).toBe(b.toString('base64url'))
  }
})
test('borne strictement la destination Storage et les parametres', () => {
  const origine = 'https://' + 'a'.repeat(20) + '.supabase.co',
    id = randomUUID()
  const url = `${origine}/storage/v1/object/sign/exports-droits/${id}?token=${'a'.repeat(32)}`
  expect(verifierUrlRemise(url, origine, id)).toBe(url)
  for (const mauvaise of [
    url.replace('https:', 'http:'),
    url.replace('.supabase.co', '.supabase.co.evil.test'),
    url + '&redirect=ailleurs',
    url + '#fragment',
    url.replace('exports-droits', 'pieces'),
    url.replace(id, randomUUID()),
  ])
    expect(() => verifierUrlRemise(mauvaise, origine, id)).toThrow()
})
