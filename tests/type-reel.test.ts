import { describe, expect, test } from 'vitest'
import { TAILLE_MAXIMALE, typeReel, verifierContenu, type Verdict } from '@/lib/coffre/type-reel'

/**
 * Ce que les octets sont vraiment.
 *
 * Les tests portent d'abord sur ce qui doit etre REFUSE. Accepter un PDF est
 * facile ; ce qui compte est qu'un fichier renomme, un document Office, une
 * photo iPhone ou un contenu quelconque ne passent pas, et qu'ils repartent
 * avec une phrase qui sert a quelque chose.
 */

/** Un contenu qui commence par une signature donnee, suivi de remplissage. */
function fichier(entete: number[], taille = 512): Buffer {
  const contenu = Buffer.alloc(taille, 0x20)
  Buffer.from(entete).copy(contenu, 0)
  return contenu
}

/** Une boite ISO : quatre octets de taille, `ftyp`, puis la marque. */
function boiteIso(marque: string): Buffer {
  const contenu = Buffer.alloc(64, 0x00)
  contenu.writeUInt32BE(32, 0)
  contenu.write('ftyp', 4, 'latin1')
  contenu.write(marque, 8, 'latin1')
  return contenu
}

const PDF = fichier([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const JPEG = fichier([0xff, 0xd8, 0xff, 0xe0])
const PNG = fichier([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function raison(verdict: Verdict): string {
  return verdict.accepte ? '' : verdict.raison
}

describe('ce que le coffre accepte', () => {
  test('les trois formats attendus sont reconnus', () => {
    expect(typeReel(PDF)).toEqual({ accepte: true, type: 'application/pdf' })
    expect(typeReel(JPEG)).toEqual({ accepte: true, type: 'image/jpeg' })
    expect(typeReel(PNG)).toEqual({ accepte: true, type: 'image/png' })
  })

  test('les variantes de JPEG passent toutes', () => {
    // Un appareil photo, un scanner et un telephone ne posent pas le meme
    // quatrieme octet. Les trois premiers suffisent, et c'est voulu.
    for (const quatrieme of [0xe0, 0xe1, 0xdb, 0xee]) {
      expect(typeReel(fichier([0xff, 0xd8, 0xff, quatrieme])).accepte).toBe(true)
    }
  })
})

describe('ce qui doit etre refuse', () => {
  test('l extension ne decide de rien', () => {
    // Le coeur du module : le nom du fichier n'entre nulle part. Un contenu
    // quelconque est refuse, quel qu'ait ete son point pdf.
    const deguise = Buffer.from('MZ  ceci est un executable', 'latin1')
    expect(typeReel(deguise).accepte).toBe(false)
  })

  test('un document Office repart avec la marche a suivre', () => {
    const docx = fichier([0x50, 0x4b, 0x03, 0x04])
    expect(typeReel(docx).accepte).toBe(false)
    expect(raison(typeReel(docx))).toContain('PDF')

    const ancien = fichier([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    expect(raison(typeReel(ancien))).toContain('PDF')
  })

  test('une photo iPhone est nommee, pas juste refusee', () => {
    // Le refus le plus frequent qu'on rencontrera. Une personne qui lit
    // que son fichier est invalide abandonne ; celle qui lit HEIC et le
    // reglage a changer redepose.
    for (const marque of ['heic', 'heix', 'mif1']) {
      const verdict = typeReel(boiteIso(marque))
      expect(verdict.accepte).toBe(false)
      expect(raison(verdict)).toContain('HEIC')
    }
  })

  test('une video est reconnue comme telle', () => {
    for (const marque of ['isom', 'mp42', 'qt  ']) {
      expect(raison(typeReel(boiteIso(marque)))).toContain('video')
    }
  })

  test('un GIF et un RTF sont nommes', () => {
    expect(raison(typeReel(fichier([0x47, 0x49, 0x46, 0x38])))).toContain('GIF')
    expect(raison(typeReel(fichier([0x7b, 0x5c, 0x72, 0x74, 0x66])))).toContain('RTF')
  })

  test('un contenu inconnu n a droit qu a la phrase generique', () => {
    const verdict = typeReel(Buffer.from('rien de particulier ici', 'utf8'))
    expect(verdict.accepte).toBe(false)
    expect(raison(verdict)).toContain('PDF')
    expect(raison(verdict)).toContain('JPEG')
  })

  test('un fichier plus court que sa signature ne fait pas lever', () => {
    // La lecture indexee d'un tampon trop court serait un plantage ; le
    // module doit rendre un verdict, pas une exception.
    for (const taille of [0, 1, 2, 3, 7, 11]) {
      expect(() => typeReel(Buffer.alloc(taille, 0x89))).not.toThrow()
      expect(typeReel(Buffer.alloc(taille, 0x89)).accepte).toBe(false)
    }
  })

  test('une signature valide precedee d un octet ne passe pas', () => {
    // Un PDF qui ne commence pas au premier octet est un fichier hybride,
    // exactement le genre de chose qu'on refuse sans discuter.
    const decale = Buffer.concat([Buffer.from([0x00]), PDF])
    expect(typeReel(decale).accepte).toBe(false)
  })
})

describe('les bornes de taille', () => {
  test('un fichier vide est refuse et le dit', () => {
    const verdict = verifierContenu(Buffer.alloc(0))
    expect(verdict.accepte).toBe(false)
    expect(raison(verdict)).toContain('vide')
  })

  test('la borne haute est fermee au bon endroit', () => {
    const juste = Buffer.alloc(TAILLE_MAXIMALE, 0x20)
    PDF.copy(juste, 0, 0, 8)
    expect(verifierContenu(juste).accepte).toBe(true)

    const unDeTrop = Buffer.alloc(TAILLE_MAXIMALE + 1, 0x20)
    PDF.copy(unDeTrop, 0, 0, 8)
    expect(verifierContenu(unDeTrop).accepte).toBe(false)
    expect(raison(verifierContenu(unDeTrop))).toContain('20 Mo')
  })

  test('la taille est verifiee avant le type', () => {
    // Sinon on promenerait un fichier hors norme dans tout le reste du
    // chemin avant de le refuser.
    const enorme = Buffer.alloc(TAILLE_MAXIMALE + 1, 0x00)
    expect(raison(verifierContenu(enorme))).toContain('Mo')
  })

  test('le PNG sert aussi de garde sur les captures d ecran', () => {
    expect(verifierContenu(PNG).accepte).toBe(true)
    expect(verifierContenu(JPEG).accepte).toBe(true)
  })
})
