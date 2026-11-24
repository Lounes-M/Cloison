import { randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { ouvrirIdentifiantsApimo, scellerIdentifiantsApimo } from '@/lib/connecteurs/apimo/secret'

const agence = randomUUID()
const identifiants = {
  agence,
  fournisseur: '4242',
  agenceApimo: '777',
  jeton: 'jeton-fictif-0123456789',
}
const attendu = { agence, fournisseur: '4242', agenceApimo: '777' }
const variables = ['CLE_MAITRESSE', 'CLE_MAITRESSE_ACTIVE', 'CLES_MAITRESSES_LECTURE'] as const
const avant = Object.fromEntries(variables.map((v) => [v, process.env[v]]))
beforeEach(() => {
  process.env.CLE_MAITRESSE = randomBytes(32).toString('base64')
  delete process.env.CLE_MAITRESSE_ACTIVE
  delete process.env.CLES_MAITRESSES_LECTURE
})
afterEach(() => {
  for (const v of variables)
    if (avant[v] === undefined) delete process.env[v]
    else process.env[v] = avant[v]
})

test('le scelle ne contient ni le jeton ni les identifiants, et differe a chaque fois', () => {
  const a = scellerIdentifiantsApimo(identifiants)
  const b = scellerIdentifiantsApimo(identifiants)
  expect(a).not.toBe(b)
  expect(a).toMatch(/^[A-Za-z0-9+/]{60,1400}={0,2}$/)
  const octets = Buffer.from(a, 'base64').toString('latin1')
  expect(octets).not.toContain('jeton-fictif')
  expect(octets).not.toContain(agence)
  expect(ouvrirIdentifiantsApimo(a, attendu)).toEqual(identifiants)
})

test('le plus long jeton accepte tient dans la colonne', () => {
  const scelle = scellerIdentifiantsApimo({ ...identifiants, jeton: 'x'.repeat(200) })
  expect(scelle.length).toBeLessThanOrEqual(1400)
  expect(ouvrirIdentifiantsApimo(scelle, attendu).jeton).toHaveLength(200)
})

test.each([
  ['une autre agence', { ...attendu, agence: randomUUID() }],
  ['un autre prestataire', { ...attendu, fournisseur: '4243' }],
  ['une autre agence Apimo', { ...attendu, agenceApimo: '778' }],
])('un scelle recopie sur %s ne s ouvre pas', (_cas, autre) => {
  const scelle = scellerIdentifiantsApimo(identifiants)
  expect(() => ouvrirIdentifiantsApimo(scelle, autre)).toThrow('Identifiants Apimo illisibles')
})

test('un octet modifie, une autre cle ou un contenu etranger sont refuses sans detail', () => {
  const scelle = scellerIdentifiantsApimo(identifiants)
  const altere = Buffer.from(scelle, 'base64')
  altere[altere.length - 1] = altere[altere.length - 1]! ^ 1
  for (const mauvais of [altere.toString('base64'), 'A'.repeat(80), '', null, 12, scelle + '!'])
    expect(() => ouvrirIdentifiantsApimo(mauvais, attendu)).toThrow(
      /^Identifiants Apimo illisibles$/,
    )
  process.env.CLE_MAITRESSE = randomBytes(32).toString('base64')
  expect(() => ouvrirIdentifiantsApimo(scelle, attendu)).toThrow(/^Identifiants Apimo illisibles$/)
})

test('la rotation de la cle maitresse garde les scelles lisibles', () => {
  const ancien = scellerIdentifiantsApimo(identifiants)
  process.env.CLE_MAITRESSE_ACTIVE = randomBytes(32).toString('base64')
  expect(ouvrirIdentifiantsApimo(ancien, attendu)).toEqual(identifiants)
  const nouveau = scellerIdentifiantsApimo(identifiants)
  expect(ouvrirIdentifiantsApimo(nouveau, attendu)).toEqual(identifiants)
  delete process.env.CLE_MAITRESSE_ACTIVE
  expect(() => ouvrirIdentifiantsApimo(nouveau, attendu)).toThrow()
})

test.each([
  { jeton: 'court' },
  { jeton: 'avec espace 000' },
  { fournisseur: 'abc' },
  { agence: 'pas-un-uuid' },
])('ne scelle pas %j', (changement) => {
  expect(() => scellerIdentifiantsApimo({ ...identifiants, ...changement })).toThrow()
})
