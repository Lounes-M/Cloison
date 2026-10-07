import { beforeAll, afterAll, afterEach, expect, test } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai } from './base'
import { decisionCollecte } from '@/lib/droits/collecte'
import { collecterCopiePersonnelle } from '@/lib/droits/brouillons'
import { fixtureComptesDroits } from '../scripts/fixture-comptes-droits.mjs'
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
async function approuver(f: Awaited<ReturnType<typeof fixtureComptesDroits>>) {
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
test('collecte un compte sans dossier, sans les autres membres', async () => {
  const f = await fixtureComptesDroits(db)
  const r = await collecterCopiePersonnelle(db, f.brut)
  expect(r.donnees.dossiers).toEqual([])
  expect(r.donnees.comptes).toHaveLength(1)
  expect(r.donnees.comptes![0]).toMatchObject({
    id: f.compte,
    email: f.decision.destinataire.email,
    telephone: '+33600000000',
    rattachement: { agence: f.agence, role: 'admin' },
  })
  expect(r.donnees.comptes![0]!.derniereConnexionLe).toBeTruthy()
  expect(JSON.stringify(r.donnees)).not.toContain(f.tiers)
  expect(JSON.stringify(r.donnees)).not.toContain('+33700000000')
  expect(r.donnees.inventaireComplet).toBe(false)
  expect(r.donnees.remiseAutorisee).toBe(false)
  expect(r.donnees.sourcesNonCouvertes).toContain('metadonnees_auth_et_identites_fournisseur')
  await r.verifier()
})
test('une selection approuvee ne permet pas un compte tiers', async () => {
  const f = await fixtureComptesDroits(db)
  f.decision.comptes = [f.tiers]
  await expect(collecterCopiePersonnelle(db, await approuver(f))).rejects.toThrow()
})
test('la portabilite exclut les evenements observes et le role attribue', async () => {
  const f = await fixtureComptesDroits(db, 'portabilite')
  const r = await collecterCopiePersonnelle(db, f.brut)
  expect(r.donnees.comptes![0]).toMatchObject({
    telephone: '+33600000000',
    rattachement: null,
    derniereConnexionLe: null,
    creeLe: null,
    emailConfirmeLe: null,
  })
  expect(r.donnees.exclusionsTechniques).toContain('evenements_auth')
})
test.each(['email', 'telephone', 'role', 'suppression'])(
  'refuse une copie devenue obsolete avant ecriture : %s',
  async (champ) => {
    const f = await fixtureComptesDroits(db)
    const r = await collecterCopiePersonnelle(db, f.brut)
    if (champ === 'email')
      await db.query(
        "update auth.users set email='change-' || id || '@example.invalid' where id=$1",
        [f.compte],
      )
    if (champ === 'telephone')
      await db.query("update auth.users set phone='+33600000001' where id=$1", [f.compte])
    if (champ === 'role')
      await db.query("update membres_agence set role='membre' where utilisateur_id=$1", [f.compte])
    if (champ === 'suppression') await db.query('delete from auth.users where id=$1', [f.compte])
    await expect(r.verifier()).rejects.toThrow()
  },
)
test.each(['anon', 'authenticated', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'la collecte refuse le role applicatif %s',
  async (role) => {
    const f = await fixtureComptesDroits(db)
    await db.exec(`set role ${role}`)
    await expect(collecterCopiePersonnelle(db, f.brut)).rejects.toThrow()
  },
)
test('le compte sans rattachement est exportable apres validation de son identite', async () => {
  const f = await fixtureComptesDroits(db)
  await db.query('delete from membres_agence where utilisateur_id=$1', [f.compte])
  expect((await collecterCopiePersonnelle(db, f.brut)).donnees.comptes![0]!.rattachement).toBeNull()
})
test('refuse selection vide, doublon, compte mal forme ou selection non approuvee', async () => {
  const f = await fixtureComptesDroits(db)
  for (const comptes of [undefined, [], [f.compte, f.compte], ['invalide']])
    expect(() => decisionCollecte(JSON.stringify({ ...f.decision, comptes }))).toThrow()
  await expect(collecterCopiePersonnelle(db, f.brut + ' ')).rejects.toThrow()
})
