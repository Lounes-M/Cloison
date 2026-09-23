import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { afterEach, expect, test, vi } from 'vitest'
import {
  empreintePdf,
  ouvrirFichierActe,
  scellerFichierActe,
  type FichierActe,
} from '@/lib/signature/archive-format'
afterEach(() => vi.restoreAllMocks())
const cle = randomBytes(32)
const pdf = Buffer.from('%PDF-1.7\nActe de recette fictif\n%%EOF')
function reference(contenu = pdf): FichierActe {
  return {
    id: randomUUID(),
    acte_id: randomUUID(),
    nature: 'acte',
    empreinte: empreintePdf(contenu),
    taille: contenu.length,
    nonce: `\\x${randomBytes(12).toString('hex')}`,
    confirme: true,
  }
}
function observerTampons() {
  const prototype = Object.getPrototypeOf(
    createDecipheriv('aes-256-gcm', cle, randomBytes(12)),
  ) as { update: (data: Buffer) => Buffer }
  const update = prototype.update
  const provisoires: Buffer[] = [],
    assembles: Buffer[] = []
  vi.spyOn(prototype, 'update').mockImplementation(function (this: typeof prototype, data) {
    const b = update.call(this, data)
    provisoires.push(b)
    return b
  })
  const concat = Buffer.concat
  vi.spyOn(Buffer, 'concat').mockImplementation((blocs, taille) => {
    const b = concat(blocs, taille)
    assembles.push(b)
    return b
  })
  return { provisoires, assembles }
}
test('un tag GCM refuse efface les octets provisoires reellement dechiffres', () => {
  const f = reference(),
    chiffre = scellerFichierActe(pdf, cle, f)
  chiffre[chiffre.length - 1] = chiffre[chiffre.length - 1]! ^ 1
  const b = observerTampons()
  expect(() => ouvrirFichierActe(chiffre, cle, f)).toThrow()
  expect(b.provisoires).toHaveLength(1)
  expect(b.provisoires[0]!.length).toBe(pdf.length)
  expect(b.provisoires[0]).toEqual(Buffer.alloc(pdf.length))
  expect(b.assembles).toHaveLength(0)
})
test('un dechiffrement valide efface ses temporaires et conserve seulement le resultat', () => {
  const f = reference(),
    chiffre = scellerFichierActe(pdf, cle, f)
  const b = observerTampons()
  const resultat = ouvrirFichierActe(chiffre, cle, f)
  expect(resultat).toEqual(pdf)
  expect(b.provisoires[0]).toEqual(Buffer.alloc(pdf.length))
  expect(b.assembles).toEqual([resultat])
})
test.each(['empreinte', 'format'])(
  'un refus de %s apres authentification efface aussi le PDF assemble',
  (motif) => {
    const contenu = motif === 'format' ? Buffer.alloc(pdf.length, 65) : pdf
    const f = reference(contenu)
    if (motif === 'empreinte') f.empreinte = 'a'.repeat(64)
    // Chiffrement authentique d'un contenu incoherent avec les metadonnees attendues.
    const chiffre = createCipheriv('aes-256-gcm', cle, Buffer.from(f.nonce.slice(2), 'hex'))
    chiffre.setAAD(
      Buffer.from(
        JSON.stringify(['cloison-acte-v1', f.acte_id, f.id, f.nature, f.empreinte, f.taille]),
      ),
    )
    const octets = Buffer.concat([chiffre.update(contenu), chiffre.final(), chiffre.getAuthTag()])
    const b = observerTampons()
    expect(() => ouvrirFichierActe(octets, cle, f)).toThrow('Archive invalide')
    expect(b.provisoires[0]).toEqual(Buffer.alloc(pdf.length))
    expect(b.assembles).toHaveLength(1)
    expect(b.assembles[0]).toEqual(Buffer.alloc(pdf.length))
  },
)
