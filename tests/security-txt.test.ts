import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

import { identiteEditeur } from '@/lib/content/juridique'

test('security.txt suit la RFC 9116 et pointe vers le contact deja publie', () => {
  const texte = readFileSync(join(process.cwd(), 'public/.well-known/security.txt'), 'utf8')
  const champs = Object.fromEntries(
    texte
      .trim()
      .split('\n')
      .map((ligne) => {
        const coupe = ligne.indexOf(': ')
        return [ligne.slice(0, coupe), ligne.slice(coupe + 2)]
      }),
  )
  expect(champs.Contact).toBe(`mailto:${identiteEditeur.courriel}`)
  expect(champs['Preferred-Languages']).toBe('fr, en')
  expect(champs.Canonical).toBe('https://www.cloison.immo/.well-known/security.txt')
  const expire = new Date(champs.Expires ?? '')
  expect(expire.getTime()).toBeGreaterThan(Date.parse('2027-11-23T00:00:00Z'))
  expect(expire.getTime()).toBeLessThanOrEqual(Date.parse('2027-11-24T23:59:59.000Z'))
})
