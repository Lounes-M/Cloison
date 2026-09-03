import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, test } from 'vitest'
import { cleMaitresse } from '@/lib/coffre/cle-maitresse'

/**
 * La lecture de la cle maitresse.
 *
 * Une KEK mal copiee est le genre d'erreur qui ne se voit pas : le chiffrement
 * fonctionnerait avec une cle tronquee, et on ne s'en apercevrait qu'a l'audit.
 * D'ou un echec a la lecture, et des tests qui portent uniquement sur les cas
 * ou elle doit refuser.
 */

const original = process.env.CLE_MAITRESSE

afterEach(() => {
  if (original === undefined) delete process.env.CLE_MAITRESSE
  else process.env.CLE_MAITRESSE = original
})

describe('cle maitresse', () => {
  test('une cle de 32 octets en base64 est acceptee', () => {
    const attendue = randomBytes(32)
    process.env.CLE_MAITRESSE = attendue.toString('base64')
    expect(cleMaitresse()).toEqual(attendue)
  })

  test('son absence est signalee avec la commande pour la generer', () => {
    delete process.env.CLE_MAITRESSE
    expect(() => cleMaitresse()).toThrow(/CLE_MAITRESSE est absente/)
    expect(() => cleMaitresse()).toThrow(/randomBytes\(32\)/)
  })

  test('une valeur vide vaut absente', () => {
    // Le meme piege que `NEXT_PUBLIC_SITE_URL` : une variable creee puis
    // laissee vide dans un tableau de bord vaut la chaine vide, pas undefined.
    for (const vide of ['', '   ']) {
      process.env.CLE_MAITRESSE = vide
      expect(() => cleMaitresse()).toThrow(/absente/)
    }
  })

  test('une cle tronquee est refusee, en disant sa taille', () => {
    for (const taille of [16, 24, 31, 33]) {
      process.env.CLE_MAITRESSE = randomBytes(taille).toString('base64')
      expect(() => cleMaitresse()).toThrow(new RegExp(`elle en fait ${taille}`))
    }
  })

  test('une chaine qui n est pas du base64 est refusee', () => {
    process.env.CLE_MAITRESSE = 'ceci-nest-pas-une-cle'
    expect(() => cleMaitresse()).toThrow(/32 octets/)
  })
})
