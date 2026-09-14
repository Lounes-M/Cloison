import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { verifierSuiviExport } from '../scripts/suivi-export-droits.mjs'
import type { DecisionPaquet } from '../scripts/paquet-droits.mjs'

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

async function decision(nature = 'acces', etat = 'en_cours'): Promise<DecisionPaquet> {
  const demande = randomUUID(),
    premiere = randomUUID(),
    revision = randomUUID()
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    values($1,$2,$1,$3,'recue',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days',repeat('a',64))`,
    [premiere, demande, nature],
  )
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,$2,recu_le,repondre_avant,effacer_le,preuve_sha256 from suivi_demandes_droits where operation=$3`,
    [revision, etat, premiere],
  )
  await new Promise((resolve) => setTimeout(resolve, 10))
  return {
    version: 1,
    demande,
    revision,
    decisionSha256: 'a'.repeat(64),
    destinataireSha256: 'b'.repeat(64),
    creeLe: new Date().toISOString(),
    expireLe: new Date(Date.now() + 60000).toISOString(),
    exclusions: [],
    fichiers: [{ nom: 'donnees-0001.txt', taille: 0, sha256: 'c'.repeat(64) }],
  }
}

test.each(['acces', 'portabilite'])('accepte la decision courante pour %s', async (nature) => {
  await expect(verifierSuiviExport(db, await decision(nature))).resolves.toBeUndefined()
})
test.each(['effacement', 'rectification', 'opposition', 'limitation'])(
  'refuse une demande de %s',
  async (nature) => {
    await expect(verifierSuiviExport(db, await decision(nature))).rejects.toThrow(
      'Decision export indisponible',
    )
  },
)
test.each(['identite_a_verifier', 'repondu'])('refuse un suivi %s', async (etat) => {
  await expect(verifierSuiviExport(db, await decision('acces', etat))).rejects.toThrow()
})
test.each(['demande', 'revision', 'decisionSha256', 'creeLe', 'expireLe'] as const)(
  'refuse une divergence de %s',
  async (champ) => {
    const d = await decision()
    const valeurs = {
      demande: randomUUID(),
      revision: randomUUID(),
      decisionSha256: 'd'.repeat(64),
      creeLe: new Date(Date.now() - 60000).toISOString(),
      expireLe: new Date(Date.now() + 86400000 * 3).toISOString(),
    }
    await expect(verifierSuiviExport(db, { ...d, [champ]: valeurs[champ] })).rejects.toThrow()
  },
)
test('une nouvelle etape invalide immediatement la revision precedente', async () => {
  const d = await decision()
  await verifierSuiviExport(db, d)
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,'identite_a_verifier',recu_le,repondre_avant,effacer_le,preuve_sha256 from suivi_demandes_droits where operation=$2`,
    [randomUUID(), d.revision],
  )
  await expect(verifierSuiviExport(db, d)).rejects.toThrow()
})
test('une panne SQL ne divulgue pas son message et refuse le controle', async () => {
  const d = await decision()
  await expect(
    verifierSuiviExport(
      {
        query: async () => {
          throw new Error('connexion privee')
        },
      },
      d,
    ),
  ).rejects.toThrow(/^Decision export indisponible dans le suivi courant\.$/)
})
