import { randomBytes } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { TAILLE_CLE, memeCle, nouvelleCle, ouvrir, sceller } from '@/lib/coffre/enveloppe'

/**
 * Le chiffrement des pieces.
 *
 * C'est le seul code du produit dont une erreur ne se voit pas : un
 * chiffrement casse rend des octets, un chiffrement solide aussi. Les tests
 * portent donc sur ce qui doit ECHOUER, et sur les proprietes qu'on ne peut
 * pas constater a l'oeil.
 */

const CONTENU = Buffer.from('Bulletin de paie, mars. Ceci tient lieu de piece sensible.', 'utf8')

describe('sceller et ouvrir', () => {
  test('ce qu on scelle se rouvre a l identique', () => {
    const cle = nouvelleCle()
    expect(ouvrir(sceller(CONTENU, cle), cle)).toEqual(CONTENU)
  })

  test('un contenu vide passe aussi', () => {
    const cle = nouvelleCle()
    const vide = Buffer.alloc(0)
    expect(ouvrir(sceller(vide, cle), cle)).toEqual(vide)
  })

  test('un contenu volumineux passe', () => {
    const cle = nouvelleCle()
    const gros = randomBytes(2 * 1024 * 1024)
    expect(ouvrir(sceller(gros, cle), cle)).toEqual(gros)
  })

  test('le chiffre ne contient pas le clair', () => {
    const scelle = sceller(CONTENU, nouvelleCle())
    expect(scelle.includes(CONTENU)).toBe(false)
    expect(scelle.toString('utf8')).not.toContain('Bulletin')
  })
})

describe('ce qui doit echouer', () => {
  test('un seul octet modifie fait echouer l ouverture', () => {
    const cle = nouvelleCle()
    const scelle = sceller(CONTENU, cle)

    // La propriete pour laquelle on a choisi un mode authentifie. Sans elle,
    // une piece alteree rendrait de la bouillie que rien ne distinguerait d'un
    // document, et l'agence deciderait dessus.
    for (const position of [0, 6, 20, scelle.length - 1]) {
      const altere = Buffer.from(scelle)
      // `writeUInt8` plutot que l'acces indexe : sous
      // `noUncheckedIndexedAccess`, `altere[position]` vaut
      // `number | undefined` et le `^=` ne compile pas.
      altere.writeUInt8(altere.readUInt8(position) ^ 0x01, position)
      expect(() => ouvrir(altere, cle)).toThrow()
    }
  })

  test('une autre cle ne rend rien, meme pas de la bouillie', () => {
    const scelle = sceller(CONTENU, nouvelleCle())
    expect(() => ouvrir(scelle, nouvelleCle())).toThrow()
  })

  test('un tampon tronque est refuse avec un message clair', () => {
    const cle = nouvelleCle()
    const scelle = sceller(CONTENU, cle)

    expect(() => ouvrir(scelle.subarray(0, 10), cle)).toThrow(/trop court/)
    expect(() => ouvrir(Buffer.alloc(0), cle)).toThrow(/trop court/)
  })

  test('la marque d authenticite ne se retire pas', () => {
    const cle = nouvelleCle()
    const scelle = sceller(CONTENU, cle)

    // On enleve la marque en esperant que l'ouverture se contente du nonce :
    // elle doit refuser.
    const sansMarque = Buffer.concat([scelle.subarray(0, 12), scelle.subarray(28)])
    expect(() => ouvrir(sansMarque, cle)).toThrow()
  })

  test('une cle de la mauvaise taille est refusee des l appel', () => {
    for (const taille of [0, 16, 31, 33, 64]) {
      const mauvaise = randomBytes(taille)
      expect(() => sceller(CONTENU, mauvaise)).toThrow(/32 octets/)
      expect(() => ouvrir(sceller(CONTENU, nouvelleCle()), mauvaise)).toThrow(/32 octets/)
    }
  })
})

describe('les proprietes qu on ne voit pas a l oeil', () => {
  test('le meme contenu scelle deux fois donne deux resultats differents', () => {
    const cle = nouvelleCle()
    const a = sceller(CONTENU, cle)
    const b = sceller(CONTENU, cle)

    // Le nonce est tire a chaque appel. Rejouer un nonce avec la meme cle est,
    // en GCM, ce qui casse tout : ce test garde cette propriete.
    expect(a.equals(b)).toBe(false)
    expect(a.subarray(0, 12).equals(b.subarray(0, 12))).toBe(false)

    // Et les deux se rouvrent quand meme.
    expect(ouvrir(a, cle)).toEqual(CONTENU)
    expect(ouvrir(b, cle)).toEqual(CONTENU)
  })

  test('mille nonces tires ne se repetent pas', () => {
    const cle = nouvelleCle()
    const nonces = new Set<string>()
    for (let i = 0; i < 1000; i += 1) {
      nonces.add(sceller(CONTENU, cle).subarray(0, 12).toString('hex'))
    }
    expect(nonces.size).toBe(1000)
  })

  test('deux cles neuves sont differentes et de la bonne taille', () => {
    const cles = new Set<string>()
    for (let i = 0; i < 100; i += 1) {
      const cle = nouvelleCle()
      expect(cle.length).toBe(TAILLE_CLE)
      cles.add(cle.toString('hex'))
    }
    expect(cles.size).toBe(100)
  })

  test('memeCle compare sans se tromper', () => {
    const cle = nouvelleCle()
    expect(memeCle(cle, Buffer.from(cle))).toBe(true)
    expect(memeCle(cle, nouvelleCle())).toBe(false)
    // Des longueurs differentes ne doivent pas faire lever `timingSafeEqual`.
    expect(memeCle(cle, Buffer.alloc(8))).toBe(false)
  })
})

describe("l'enveloppe complete", () => {
  test('une cle de dossier scellee par la cle maitresse se retrouve', () => {
    const cleMaitresse = nouvelleCle()
    const cleDuDossier = nouvelleCle()

    // C'est le trajet reel : la DEK est scellee par la KEK et rangee en base,
    // les pieces sont scellees par la DEK et rangees dans Storage.
    const cleRangee = sceller(cleDuDossier, cleMaitresse)
    const piece = sceller(CONTENU, cleDuDossier)

    const cleRelue = ouvrir(cleRangee, cleMaitresse)
    expect(ouvrir(piece, cleRelue)).toEqual(CONTENU)
  })

  test('sans la cle maitresse, la cle du dossier ne sert a rien', () => {
    const cleDuDossier = nouvelleCle()
    const cleRangee = sceller(cleDuDossier, nouvelleCle())

    // Le point qui porte l'ADR 0003 : qui obtiendrait la base sans la KEK
    // n'aurait que des octets inertes.
    expect(() => ouvrir(cleRangee, nouvelleCle())).toThrow()
  })

  test('la cle d un dossier n ouvre pas les pieces d un autre', () => {
    const dossierA = nouvelleCle()
    const dossierB = nouvelleCle()
    const pieceDeA = sceller(CONTENU, dossierA)

    // Une cle par dossier : une fuite reste bornee a un dossier.
    expect(() => ouvrir(pieceDeA, dossierB)).toThrow()
  })
})
