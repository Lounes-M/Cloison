import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { verifierSuiviExport } from '../scripts/suivi-export-droits.mjs'
import { lireApprobationExport } from '../scripts/approbation-export-droits.mjs'
import { approbationFictive } from './approbation-export-fixture'

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(
    'create role anon; create role authenticated; create role porteur_lien; create role serveur; create role depot_piece; create role service_role;',
  )
  await db.exec(
    readFileSync(
      new URL('../supabase/migrations/0053_suivi_demandes_droits.sql', import.meta.url),
      'utf8',
    ),
  )
})
afterAll(async () => {
  await db.close()
})

async function approuver(
  options: {
    nature?: string
    etat?: string
    operateur?: string
    age?: number
    conservationJours?: number
    duree?: number
  } = {},
) {
  const a = approbationFictive({
    demande: randomUUID(),
    revision: randomUUID(),
    creeLe: new Date(Date.now() - (options.age ?? 100)).toISOString(),
    expireLe: new Date(Date.now() + (options.duree ?? 60000)).toISOString(),
    exclusions: ['tiers'],
    fichiers: [{ nom: 'donnees-0001.txt', taille: 0, sha256: 'c'.repeat(64) }],
  })
  if (options.nature === 'portabilite') a.nature = 'portabilite'
  const brut = JSON.stringify(a)
  const debut = randomUUID()
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    values($1,$2,$3,$4,'recue',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',clock_timestamp()+$5::int*interval '1 day',repeat('a',64))`,
    [
      debut,
      a.demande,
      options.operateur ?? a.operateur,
      options.nature ?? a.nature,
      options.conservationJours ?? 2,
    ],
  )
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,$2,recu_le,repondre_avant,effacer_le,$3 from suivi_demandes_droits where operation=$4`,
    [
      a.revision,
      options.etat ?? 'en_cours',
      createHash('sha256').update(brut).digest('hex'),
      debut,
    ],
  )
  return { a, brut, d: lireApprobationExport(brut).decision }
}

test.each(['acces', 'portabilite'])(
  'accepte le paquet derive de l approbation courante pour %s',
  async (nature) => {
    const { d, brut } = await approuver({ nature })
    await expect(verifierSuiviExport(db, d, brut)).resolves.toBeUndefined()
  },
)
test.each(['effacement', 'rectification', 'opposition', 'limitation'])(
  'refuse un registre de nature %s',
  async (nature) => {
    const { d, brut } = await approuver({ nature })
    await expect(verifierSuiviExport(db, d, brut)).rejects.toThrow('Decision export indisponible')
  },
)
test.each(['identite_a_verifier', 'repondu'])('refuse le suivi %s', async (etat) => {
  const { d, brut } = await approuver({ etat })
  await expect(verifierSuiviExport(db, d, brut)).rejects.toThrow()
})
test('refuse un operateur different de celui de l approbation inscrite', async () => {
  const { d, brut } = await approuver({ operateur: randomUUID() })
  await expect(verifierSuiviExport(db, d, brut)).rejects.toThrow()
})
test('refuse une approbation preparee plus de cinq minutes avant son inscription', async () => {
  const { d, brut } = await approuver({ age: 301000 })
  await expect(verifierSuiviExport(db, d, brut)).rejects.toThrow()
})
test('refuse une expiration depassant la conservation du registre', async () => {
  const { d, brut } = await approuver({ conservationJours: 1, duree: 2 * 86400000 })
  await expect(verifierSuiviExport(db, d, brut)).rejects.toThrow()
})
test.each([
  'demande',
  'revision',
  'decisionSha256',
  'destinataireSha256',
  'creeLe',
  'expireLe',
  'exclusions',
  'fichiers',
] as const)('une preuve valable ne permet pas de changer %s dans le manifeste', async (champ) => {
  const { d, brut } = await approuver()
  const valeurs = {
    demande: randomUUID(),
    revision: randomUUID(),
    decisionSha256: 'd'.repeat(64),
    destinataireSha256: 'd'.repeat(64),
    creeLe: new Date(Date.parse(d.creeLe) - 1000).toISOString(),
    expireLe: new Date(Date.parse(d.expireLe) + 1000).toISOString(),
    exclusions: [],
    fichiers: [{ ...d.fichiers[0]!, sha256: 'e'.repeat(64) }],
  }
  await expect(verifierSuiviExport(db, { ...d, [champ]: valeurs[champ] }, brut)).rejects.toThrow()
})
test.each(['destinataire', 'fichiers', 'revue', 'espaces'])(
  'modifier la preuve et recalculer le manifeste ne remplace pas le registre : %s',
  async (champ) => {
    const { a, brut } = await approuver()
    if (champ === 'destinataire') a.destinataire.reference = randomUUID()
    if (champ === 'fichiers') a.fichiers[0]!.sha256 = 'e'.repeat(64)
    if (champ === 'revue') a.destinataire.identiteSha256 = 'e'.repeat(64)
    const autre = champ === 'espaces' ? brut + ' ' : JSON.stringify(a)
    const d = lireApprobationExport(autre).decision
    await expect(verifierSuiviExport(db, d, autre)).rejects.toThrow()
  },
)
test('une nouvelle etape revoque la preparation precedente', async () => {
  const { d, brut } = await approuver()
  await verifierSuiviExport(db, d, brut)
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,'identite_a_verifier',recu_le,repondre_avant,effacer_le,preuve_sha256 from suivi_demandes_droits where operation=$2`,
    [randomUUID(), d.revision],
  )
  await expect(verifierSuiviExport(db, d, brut)).rejects.toThrow()
})
test('refuse une preuve absente et masque les erreurs SQL', async () => {
  const { d, brut } = await approuver()
  await expect(verifierSuiviExport(db, d, '')).rejects.toThrow(
    /^Decision export indisponible dans le suivi courant\.$/,
  )
  await expect(
    verifierSuiviExport(
      {
        query: async () => {
          throw new Error('connexion privee')
        },
      },
      d,
      brut,
    ),
  ).rejects.toThrow(/^Decision export indisponible dans le suivi courant\.$/)
})
