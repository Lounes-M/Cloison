import { beforeAll, afterAll, afterEach, expect, test } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai } from './base'
import { collecterDonneesDroits, decisionCollecte, type BaseCollecte } from '@/lib/droits/collecte'
import { fixtureCollecteDroits } from '../scripts/fixture-collecte-droits.mjs'

let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
afterEach(async () => {
  await db.exec('reset role')
})
async function reapprouver(f: Awaited<ReturnType<typeof fixtureCollecteDroits>>) {
  const precedente = f.decision.revision
  f.decision.revision = randomUUID()
  const brut = JSON.stringify(f.decision)
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,$2 from suivi_demandes_droits where operation=$3`,
    [f.decision.revision, createHash('sha256').update(brut).digest('hex'), precedente],
  )
  return brut
}
test('refuse une fenetre de collecte superieure a 72 heures meme approuvee', async () => {
  const f = await fixtureCollecteDroits(db)
  f.decision.expireLe = new Date(Date.now() + 73 * 3600000).toISOString()
  await expect(collecterDonneesDroits(db, await reapprouver(f))).rejects.toThrow(
    'Collecte individuelle refusee.',
  )
})
test('une selection approuvee ne permet pas de collecter un dossier etranger', async () => {
  const f = await fixtureCollecteDroits(db)
  f.decision.dossiers.push({ id: f.etranger, partie: 'garant' })
  await expect(collecterDonneesDroits(db, await reapprouver(f))).rejects.toThrow(
    'Collecte individuelle refusee.',
  )
})
test('collecte uniquement les champs propres aux roles approuves sans arrondir les montants', async () => {
  const f = await fixtureCollecteDroits(db)
  const r = await collecterDonneesDroits(db, f.brut)
  expect(r.dossiers).toHaveLength(2)
  expect(r.dossiers[0]!.engagement?.revenu_net_mensuel_cents).toBe('9007199254740993')
  expect(r.dossiers[0]!.engagement?.nom).toBe('Garant concerne')
  expect(r.dossiers[0]!.engagement?.ratio).toBe('999.99')
  expect(r.dossiers[0]!.pieces).toHaveLength(1)
  expect(r.dossiers[1]!.nom_locataire).toBe('Locataire concerne')
  expect(r.dossiers[1]!.engagement).toBeNull()
  expect(r.dossiers[1]!.pieces).toEqual([])
  for (const interdit of [
    'Identite tierce interdite',
    'Garant tiers interdit',
    'chemin-prive-interdit',
    'garant-tiers@example.invalid',
    'locataire-tiers@example.invalid',
    f.etranger,
  ])
    expect(JSON.stringify(r)).not.toContain(interdit)
  expect(r.remiseAutorisee).toBe(false)
  expect(r.inventaireComplet).toBe(false)
  expect(r.sourcesNonCouvertes).toContain('paiements_et_prestataires')
})
test('la portabilite exclut les valeurs calculees et signale cette exclusion', async () => {
  const f = await fixtureCollecteDroits(db, 'portabilite')
  const r = await collecterDonneesDroits(db, f.brut)
  expect(r.dossiers[0]!.engagement?.ratio).toBeNull()
  expect(r.dossiers[0]!.engagement?.calcule_le).toBeNull()
  expect(r.exclusionsTechniques).toContain('ratio_calcule')
})
test('refuse toute modification des octets approuves meme si les donnees JSON sont identiques', async () => {
  const f = await fixtureCollecteDroits(db)
  await expect(collecterDonneesDroits(db, f.brut + '\n')).rejects.toThrow(
    'Collecte individuelle refusee.',
  )
})
test('refuse un rattachement modifie dans la base sans livrer les autres dossiers', async () => {
  const f = await fixtureCollecteDroits(db)
  await db.query('update dossiers set email_locataire=$1 where id=$2', [
    'remplace@example.invalid',
    f.locataire,
  ])
  await expect(collecterDonneesDroits(db, f.brut)).rejects.toThrow('Collecte individuelle refusee.')
})
test('refuse un dossier disparu sans tronquer silencieusement la collecte', async () => {
  const f = await fixtureCollecteDroits(db)
  await db.query('delete from dossiers where id=$1', [f.locataire])
  await expect(collecterDonneesDroits(db, f.brut)).rejects.toThrow('Collecte individuelle refusee.')
})
test('une nouvelle decision pendant la lecture invalide le resultat hors instantane', async () => {
  const f = await fixtureCollecteDroits(db)
  const relais: BaseCollecte = {
    query: async (sql, params) => {
      const r = await db.query<Record<string, unknown>>(sql, params)
      if (sql === 'rollback')
        await db.query(
          `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
      select $1,demande,operation,operateur,nature,'identite_a_verifier',recu_le,repondre_avant,effacer_le,preuve_sha256 from suivi_demandes_droits where operation=$2`,
          [randomUUID(), f.decision.revision],
        )
      return r
    },
  }
  await expect(collecterDonneesDroits(relais, f.brut)).rejects.toThrow(
    'Collecte individuelle refusee.',
  )
})
test.each(['anon', 'authenticated', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'le role %s ne peut utiliser le collecteur prive',
  async (role) => {
    const f = await fixtureCollecteDroits(db)
    await db.exec(`set role ${role}`)
    await expect(collecterDonneesDroits(db, f.brut)).rejects.toThrow(
      'Collecte individuelle refusee.',
    )
  },
)
test('ne publie aucune erreur SQL et termine la transaction', async () => {
  const f = await fixtureCollecteDroits(db)
  let termine = false
  const relais: BaseCollecte = {
    query: async (sql, params) => {
      if (sql.includes('with selection')) throw new Error('Message prive avec identite')
      if (sql === 'rollback') termine = true
      return db.query<Record<string, unknown>>(sql, params)
    },
  }
  await expect(collecterDonneesDroits(relais, f.brut)).rejects.toThrow(
    /^Collecte individuelle refusee\.$/,
  )
  expect(termine).toBe(true)
})
test('les decisions invalides sont refusees avant acces SQL', async () => {
  const f = await fixtureCollecteDroits(db)
  const essais = [
    { ...f.decision, dossiers: [] },
    {
      ...f.decision,
      dossiers: Array.from({ length: 51 }, () => ({ id: randomUUID(), partie: 'garant' })),
    },
    { ...f.decision, dossiers: [f.decision.dossiers[0], f.decision.dossiers[0]] },
    { ...f.decision, nature: 'effacement' },
    { ...f.decision, expireLe: '2020-01-01T00:00:00Z' },
    { ...f.decision, destinataire: { ...f.decision.destinataire, mandat: 'a_verifier' } },
  ]
  for (const essai of essais)
    expect(() => decisionCollecte(JSON.stringify(essai))).toThrow('Collecte individuelle refusee.')
})
