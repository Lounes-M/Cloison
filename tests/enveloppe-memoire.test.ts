import { Decipheriv, randomBytes } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { ouvrir, sceller } from '../lib/coffre/enveloppe'

it.each([false, true])(
  'efface le clair intermediaire du dechiffreur, marque alteree : %s',
  (alteree) => {
    const cle = randomBytes(32)
    const clair = Buffer.from('Piece fictive a effacer des tampons temporaires')
    const archive = sceller(clair, cle)
    if (alteree) archive[12]! ^= 1
    const espion = vi.spyOn(Decipheriv.prototype, 'update')
    try {
      if (alteree) expect(() => ouvrir(archive, cle)).toThrow()
      else expect(ouvrir(archive, cle)).toEqual(clair)
      expect(espion).toHaveBeenCalledTimes(1)
      const provisoire = espion.mock.results[0]!.value as Buffer
      expect(provisoire.length).toBe(clair.length)
      expect(provisoire).toEqual(Buffer.alloc(clair.length))
      expect(clair.includes('Piece fictive')).toBe(true)
    } finally {
      espion.mockRestore()
    }
  },
)
