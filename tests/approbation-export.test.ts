import { createHash, randomUUID } from 'node:crypto'
import { expect, test } from 'vitest'
import { lireApprobationExport } from '../scripts/approbation-export-droits.mjs'
import { approbationFictive } from './approbation-export-fixture'
const maintenant = Date.parse('2026-10-07T10:00:00Z')
function approbation() {
  return approbationFictive({
    demande: randomUUID(),
    revision: randomUUID(),
    creeLe: '2026-10-07T09:59:00Z',
    expireLe: '2026-10-08T09:59:00Z',
    exclusions: ['tiers'],
    fichiers: [{ nom: 'donnees-0001.txt', taille: 0, sha256: 'a'.repeat(64) }],
  })
}
test('derive les deux empreintes de la preuve et de la reference aleatoire sans copier les preuves privees', () => {
  const a = approbation(),
    brut = JSON.stringify(a, null, 2)
  const r = lireApprobationExport(brut, maintenant)
  expect(r.decision).toEqual({
    version: 1,
    demande: a.demande,
    revision: a.revision,
    decisionSha256: createHash('sha256').update(brut).digest('hex'),
    destinataireSha256: createHash('sha256').update(a.destinataire.reference).digest('hex'),
    creeLe: a.creeLe,
    expireLe: a.expireLe,
    exclusions: a.exclusions,
    fichiers: a.fichiers,
  })
  expect(r.operateur).toBe(a.operateur)
  expect(JSON.stringify(r.decision)).not.toContain(a.destinataire.identiteSha256)
  expect(JSON.stringify(r.decision)).not.toContain(a.destinataire.reference)
})
test.each([
  { usage: 'collecte' },
  { nature: 'effacement' },
  { inventaireComplet: false },
  { revueTiersValidee: false },
  { inventaireComplet: undefined },
  {
    destinataire: { reference: randomUUID(), identiteSha256: 'a'.repeat(64), mandat: 'a_verifier' },
  },
  {
    destinataire: {
      reference: 'personne@example.test',
      identiteSha256: 'a'.repeat(64),
      mandat: 'non_requis',
    },
  },
  { destinataire: { reference: randomUUID(), identiteSha256: '', mandat: 'non_requis' } },
  { fichiers: [] },
  { fichiers: [{ nom: '../secret', taille: 1, sha256: 'a'.repeat(64) }] },
  { fichiers: [{ nom: 'piece-0001.pdf', taille: 20 * 1024 * 1024 + 1, sha256: 'a'.repeat(64) }] },
  {
    fichiers: [
      { nom: 'piece-0001.pdf', taille: 1, sha256: 'a'.repeat(64), email: 'tiers@example.test' },
    ],
  },
  { exclusions: ['tiers', 'tiers'] },
  { creeLe: '2026-10-07T10:00:01Z' },
  { expireLe: '2026-10-07T10:00:00Z' },
  { expireLe: '2026-10-11T10:00:00Z' },
  { decisionSha256: 'a'.repeat(64) },
  { secret: 'interdit' },
])('refuse les prerequis ou le perimetre invalides %#', (changement) => {
  expect(() =>
    lireApprobationExport(JSON.stringify({ ...approbation(), ...changement }), maintenant),
  ).toThrow(/^Approbation export invalide\.$/)
})
test('refuse un manifeste ancien, une preuve surdimensionnee, un objet brut et une horloge invalide', () => {
  const brut = JSON.stringify(approbation())
  const d = lireApprobationExport(brut, maintenant).decision
  for (const v of [
    JSON.stringify(d),
    brut + ' '.repeat(256 * 1024),
    approbation(),
    'secret-confidentiel',
  ])
    expect(() => lireApprobationExport(v, maintenant)).toThrow(/^Approbation export invalide\.$/)
  expect(() => lireApprobationExport(brut, NaN)).toThrow()
})
