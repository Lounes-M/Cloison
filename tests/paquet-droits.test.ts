import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sceller, ouvrir } from '../lib/coffre/enveloppe'
import {
  creerPaquetDroits,
  ouvrirPaquetDroits,
  verifierDecisionPaquet,
  type DecisionPaquet,
} from '../scripts/paquet-droits.mjs'

const maintenant = Date.parse('2026-09-12T12:00:00Z')
const cle = randomBytes(32)
const contenu = Buffer.from('Contenu fictif reserve au demandeur')
const fichiers = new Map([['donnees-0001.txt', contenu]])
function decision(): DecisionPaquet {
  return {
    version: 1,
    demande: randomUUID(),
    revision: randomUUID(),
    decisionSha256: 'a'.repeat(64),
    destinataireSha256: 'b'.repeat(64),
    creeLe: '2026-09-12T11:00:00Z',
    expireLe: '2026-09-13T11:00:00Z',
    exclusions: ['tiers'],
    fichiers: [
      {
        nom: 'donnees-0001.txt',
        taille: contenu.length,
        sha256: createHash('sha256').update(contenu).digest('hex'),
      },
    ],
  }
}
function alterer(archive: Buffer, transformation: (paquet: Record<string, unknown>) => void) {
  const p = JSON.parse(ouvrir(archive, cle).toString())
  transformation(p)
  return sceller(Buffer.from(JSON.stringify(p)), cle)
}

describe('Paquet personnel lie a une decision explicite', () => {
  it('restitue les octets et le manifeste, avec un chiffrement aleatoire', () => {
    const d = decision()
    const a = creerPaquetDroits(d, fichiers, cle, maintenant)
    const b = creerPaquetDroits(d, fichiers, cle, maintenant)
    expect(a.equals(b)).toBe(false)
    expect(a.includes(contenu)).toBe(false)
    expect(ouvrirPaquetDroits(a, cle, d, maintenant)).toEqual({ decision: d, fichiers })
  })

  it.each(['demande', 'revision', 'decisionSha256', 'destinataireSha256'] as const)(
    'refuse une autre %s attendue meme avec la bonne cle',
    (champ) => {
      const d = decision()
      const archive = creerPaquetDroits(d, fichiers, cle, maintenant)
      const autre = { ...d, [champ]: champ.endsWith('Sha256') ? 'c'.repeat(64) : randomUUID() }
      expect(() => ouvrirPaquetDroits(archive, cle, autre, maintenant)).toThrow()
    },
  )
  it('refuse la prolongation locale de la date du paquet existant', () => {
    const d = decision()
    const archive = creerPaquetDroits(d, fichiers, cle, maintenant)
    expect(() =>
      ouvrirPaquetDroits(archive, cle, { ...d, expireLe: '2027-01-01T00:00:00Z' }, maintenant),
    ).toThrow()
  })
  it.each([
    { creeLe: '2026-09-12T12:00:01Z' },
    { expireLe: '2026-09-12T12:00:00Z' },
    { expireLe: '2026-02-30T12:00:00Z' },
    { destinataireSha256: '' },
    { cle: 'secret' },
    { fichiers: [] },
    { exclusions: ['tiers', 'tiers'] },
  ])('refuse une decision invalide : %j', (changement) => {
    expect(() => verifierDecisionPaquet({ ...decision(), ...changement }, maintenant)).toThrow()
  })
  it('refuse une horloge invalide', () => {
    expect(() => verifierDecisionPaquet(decision(), NaN)).toThrow()
  })
  it('refuse ouverture et creation a expiration exacte', () => {
    const d = decision()
    const archive = creerPaquetDroits(d, fichiers, cle, maintenant)
    const fin = Date.parse(d.expireLe)
    expect(() => creerPaquetDroits(d, fichiers, cle, fin)).toThrow()
    expect(() => ouvrirPaquetDroits(archive, cle, d, fin)).toThrow()
  })
  it.each(['../piece-0001.pdf', '/piece-0001.pdf', 'piece-0001.pdf/secret', 'cle.pem'])(
    'refuse le nom %s',
    (nom) => {
      const d = decision()
      d.fichiers[0]!.nom = nom
      expect(() => verifierDecisionPaquet(d, maintenant)).toThrow()
    },
  )
  it('refuse un doublon de nom', () => {
    const d = decision()
    d.fichiers.push(d.fichiers[0]!)
    expect(() => verifierDecisionPaquet(d, maintenant)).toThrow()
  })
  it('refuse les limites par fichier, en cumul et en nombre', () => {
    const d = decision()
    const f = d.fichiers[0]!
    expect(() =>
      verifierDecisionPaquet({ ...d, fichiers: [{ ...f, taille: 20971521 }] }, maintenant),
    ).toThrow()
    expect(() =>
      verifierDecisionPaquet(
        {
          ...d,
          fichiers: Array.from({ length: 4 }, (_, i) => ({
            ...f,
            nom: `piece-000${i}.pdf`,
            taille: 20 * 1024 * 1024,
          })),
        },
        maintenant,
      ),
    ).toThrow()
    expect(() =>
      verifierDecisionPaquet(
        {
          ...d,
          fichiers: Array.from({ length: 101 }, (_, i) => ({
            ...f,
            nom: `piece-${String(i).padStart(4, '0')}.pdf`,
          })),
        },
        maintenant,
      ),
    ).toThrow()
  })
  it('refuse fichiers manquants, surnumeraires ou modifies avant chiffrement', () => {
    const d = decision()
    for (const f of [
      new Map(),
      new Map([...fichiers, ['piece-0002.pdf', contenu]]),
      new Map([['donnees-0001.txt', Buffer.alloc(contenu.length)]]),
    ])
      expect(() => creerPaquetDroits(d, f, cle, maintenant)).toThrow()
  })
  it('refuse une cle fausse, un octet modifie et une archive tronquee', () => {
    const d = decision()
    const archive = creerPaquetDroits(d, fichiers, cle, maintenant)
    expect(() => ouvrirPaquetDroits(archive, randomBytes(32), d, maintenant)).toThrow()
    const copie = Buffer.from(archive)
    copie[copie.length - 1]! ^= 1
    expect(() => ouvrirPaquetDroits(copie, cle, d, maintenant)).toThrow()
    expect(() => ouvrirPaquetDroits(archive.subarray(0, 12), cle, d, maintenant)).toThrow()
  })
  it.each([
    (p: Record<string, unknown>) => {
      p.format = 'sauvegarde'
    },
    (p: Record<string, unknown>) => {
      p.secret = 'interdit'
    },
    (p: Record<string, unknown>) => {
      p.contenus = []
    },
    (p: Record<string, unknown>) => {
      p.contenus = [contenu.toString('base64'), '']
    },
    (p: Record<string, unknown>) => {
      p.contenus = [Buffer.alloc(contenu.length).toString('base64')]
    },
    (p: Record<string, unknown>) => {
      p.contenus = [contenu.toString('base64') + '\n']
    },
  ])('refuse un paquet malforme meme authentifie %#', (transformation) => {
    const d = decision()
    const archive = creerPaquetDroits(d, fichiers, cle, maintenant)
    expect(() => ouvrirPaquetDroits(alterer(archive, transformation), cle, d, maintenant)).toThrow()
  })
  it('refuse le Base64 non canonique de meme longueur et meme contenu decode', () => {
    const d = decision()
    const octet = Buffer.from('a')
    d.fichiers[0]!.taille = 1
    d.fichiers[0]!.sha256 = createHash('sha256').update(octet).digest('hex')
    const archive = creerPaquetDroits(d, new Map([['donnees-0001.txt', octet]]), cle, maintenant)
    expect(Buffer.from('YR==', 'base64').equals(octet)).toBe(true)
    expect(() =>
      ouvrirPaquetDroits(
        alterer(archive, (p) => {
          p.contenus = ['YR==']
        }),
        cle,
        d,
        maintenant,
      ),
    ).toThrow()
  })
})
