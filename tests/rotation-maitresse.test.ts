import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ouvrir, sceller } from '@/lib/coffre/enveloppe'
import {
  ouvrirMaitresse,
  scellerMaitresse,
  rescellerMaitresse,
} from '@/lib/coffre/rotation-maitresse'
const ancienne = randomBytes(32),
  nouvelle = randomBytes(32),
  suivante = randomBytes(32)
beforeEach(() => {
  vi.stubEnv('CLE_MAITRESSE', ancienne.toString('base64'))
  vi.stubEnv('CLE_MAITRESSE_ACTIVE', '')
  vi.stubEnv('CLES_MAITRESSES_LECTURE', '')
})
afterEach(() => vi.unstubAllEnvs())
test('sans activation les ecritures restent lisibles par le code precedent', () => {
  const clair = randomBytes(32)
  expect(ouvrir(scellerMaitresse(clair), ancienne)).toEqual(clair)
})
test('une rotation puis un retour controle conservent les trois generations', () => {
  const clair = randomBytes(32),
    v1 = sceller(clair, ancienne)
  vi.stubEnv('CLE_MAITRESSE_ACTIVE', nouvelle.toString('base64'))
  const v2 = rescellerMaitresse(v1)
  expect(v2.length).toBeLessThanOrEqual(200)
  expect(ouvrirMaitresse(v1)).toEqual(clair)
  expect(ouvrirMaitresse(v2)).toEqual(clair)
  vi.stubEnv('CLE_MAITRESSE_ACTIVE', suivante.toString('base64'))
  vi.stubEnv('CLES_MAITRESSES_LECTURE', JSON.stringify([nouvelle.toString('base64')]))
  const v3 = rescellerMaitresse(v2)
  for (const chiffre of [v1, v2, v3]) expect(ouvrirMaitresse(chiffre)).toEqual(clair)
  vi.stubEnv('CLE_MAITRESSE_ACTIVE', nouvelle.toString('base64'))
  vi.stubEnv('CLES_MAITRESSES_LECTURE', JSON.stringify([suivante.toString('base64')]))
  expect(ouvrirMaitresse(v3)).toEqual(clair)
})
test('une cle retiree et une enveloppe alteree sont refusees', () => {
  vi.stubEnv('CLE_MAITRESSE_ACTIVE', nouvelle.toString('base64'))
  const chiffre = scellerMaitresse(randomBytes(32))
  for (const position of [0, 22, chiffre.length - 1]) {
    const altere = Buffer.from(chiffre)
    altere[position] = altere[position]! ^ 1
    expect(() => ouvrirMaitresse(altere)).toThrow()
  }
  vi.stubEnv('CLE_MAITRESSE_ACTIVE', suivante.toString('base64'))
  expect(() => ouvrirMaitresse(chiffre)).toThrow()
})
test('une configuration invalide est refusee sans exposer sa valeur', () => {
  for (const invalide of [
    'PRIVE',
    JSON.stringify(['PRIVE']),
    JSON.stringify(Array(5).fill(nouvelle.toString('base64'))),
  ]) {
    vi.stubEnv('CLES_MAITRESSES_LECTURE', invalide)
    expect(() => scellerMaitresse(Buffer.from('fictif'))).toThrow('Configuration des cles invalide')
  }
})
