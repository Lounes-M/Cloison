import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import {
  baseDEssai,
  devenir,
  devenirPorteur,
  redevenirProprietaire,
  reserverObjetDEssai,
} from './base'
let db: PGlite
let dossier: string, agence: string, membre: string, piece: string
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  agence = randomUUID()
  membre = randomUUID()
  dossier = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Essai','complements.invalid')", [
    agence,
  ])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'membre@complements.invalid',now())",
    [membre],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, membre],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,loyer_cents) values($1,$2,'locataire@example.invalid',100000)",
    [dossier, agence],
  )
  await db.query('insert into engagements(dossier_id,revenu_net_mensuel_cents) values($1,300000)', [
    dossier,
  ])
  for (const type of ['avis_imposition', 'piece_identite', 'justificatif_domicile'])
    await ajouter(type, 1)
  piece = await ajouter('bulletin_paie', 3)
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function ajouter(type = 'bulletin_paie', nombre = 3) {
  await redevenirProprietaire(db)
  const id = randomUUID(),
    chemin = `${dossier}/${id}`
  await reserverObjetDEssai(db, dossier, chemin)
  await db.query(
    "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel,nombre_documents,depose_le) values($1,$2,$3,$4,100,'application/pdf',$5,clock_timestamp())",
    [id, dossier, type, chemin, nombre],
  )
  return id
}
async function demande() {
  await devenir(db, 'authenticated', membre)
  expect(
    (await db.query('select demander_complement($1,$2) ok', [piece, 'illisible'])).rows[0],
  ).toEqual({ ok: true })
  return String(
    (await db.query<{ id: string }>('select id from complements_documentaires')).rows[0]!.id,
  )
}
async function etat() {
  await redevenirProprietaire(db)
  return (await db.query<{ statut: string }>('select statut from dossiers where id=$1', [dossier]))
    .rows[0]!.statut
}
test('le complement rouvre un dossier transmis et exige un examen du remplacement', async () => {
  await devenir(db, 'authenticated', membre)
  await db.query("update dossiers set statut='transmis' where id=$1", [dossier])
  const id = await demande()
  expect(await etat()).toBe('depot_en_cours')
  const nouveau = await ajouter()
  await devenirPorteur(db, dossier, 'garant')
  expect((await db.query('select fournir_complement($1,$2) ok', [id, nouveau])).rows[0]).toEqual({
    ok: true,
  })
  expect(await etat()).toBe('depot_en_cours')
  await devenir(db, 'authenticated', membre)
  expect((await db.query('select valider_complement($1) ok', [id])).rows[0]).toEqual({ ok: true })
  expect(await etat()).toBe('complet')
  const traces = await db.query<{ action: string; acteur_id: string | null }>(
    "select action,acteur_id from journal_acces where action like 'complement_%' order by quand,id",
  )
  expect(traces.rows).toHaveLength(3)
  expect(traces.rows.filter((r) => r.acteur_id === membre)).toHaveLength(2)
})
test('le locataire ne lit ni motif ni piece et ne fournit aucun complement', async () => {
  const id = await demande()
  await devenirPorteur(db, dossier, 'locataire')
  expect((await db.query('select * from complements_documentaires')).rows).toEqual([])
  expect((await db.query('select fournir_complement($1,$2) ok', [id, piece])).rows[0]).toEqual({
    ok: false,
  })
})
test('une agence et un garant etrangers ne lisent ni ne modifient la demande', async () => {
  const id = await demande()
  await devenir(db, 'authenticated', randomUUID())
  expect((await db.query('select * from complements_documentaires')).rows).toEqual([])
  expect(
    (await db.query('select demander_complement($1,$2) ok', [piece, 'illisible'])).rows[0],
  ).toEqual({ ok: false })
  expect((await db.query('select valider_complement($1) ok', [id])).rows[0]).toEqual({ ok: false })
  await redevenirProprietaire(db)
  const autre = randomUUID()
  await db.query("insert into dossiers(id,email_locataire) values($1,'autre@example.invalid')", [
    autre,
  ])
  await devenirPorteur(db, autre, 'garant')
  expect((await db.query('select * from complements_documentaires')).rows).toEqual([])
  expect((await db.query('select fournir_complement($1,$2) ok', [id, piece])).rows[0]).toEqual({
    ok: false,
  })
})
test('une piece anterieure ou de mauvaise nature ne repond pas a la demande', async () => {
  const ancienne = await ajouter()
  const id = await demande()
  const mauvaise = await ajouter('piece_identite', 1)
  await devenirPorteur(db, dossier, 'garant')
  for (const p of [piece, ancienne, mauvaise])
    expect((await db.query('select fournir_complement($1,$2) ok', [id, p])).rows[0]).toEqual({
      ok: false,
    })
})
test('le retrait du remplacement valide reouvre la demande et la completude', async () => {
  const id = await demande(),
    nouveau = await ajouter()
  await devenirPorteur(db, dossier, 'garant')
  await db.query('select fournir_complement($1,$2)', [id, nouveau])
  await devenir(db, 'authenticated', membre)
  await db.query('select valider_complement($1)', [id])
  await devenirPorteur(db, dossier, 'garant')
  await db.query('delete from pieces where id=$1', [nouveau])
  expect((await db.query('select etat,piece_fournie from complements_documentaires')).rows).toEqual(
    [{ etat: 'demande', piece_fournie: null }],
  )
  expect(await etat()).toBe('depot_en_cours')
})
for (const statut of ['signe', 'refuse', 'expire'])
  test(`un dossier ${statut} nest pas rouvert`, async () => {
    await db.query('update dossiers set statut=$1 where id=$2', [statut, dossier])
    await devenir(db, 'authenticated', membre)
    expect(
      (await db.query('select demander_complement($1,$2) ok', [piece, 'illisible'])).rows[0],
    ).toEqual({ ok: false })
  })
test('les echeances et la MFA sont controlees dans le RPC', async () => {
  await devenir(db, 'authenticated', membre)
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: 'authenticated', sub: membre, aal: 'aal1' }),
  ])
  expect(
    (await db.query('select demander_complement($1,$2) ok', [piece, 'illisible'])).rows[0],
  ).toEqual({ ok: false })
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set cree_le=now()-interval '2 days',expire_le=now()-interval '1 day' where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', membre)
  expect(
    (await db.query('select demander_complement($1,$2) ok', [piece, 'illisible'])).rows[0],
  ).toEqual({ ok: false })
})
test('une demande deja creee ne produit pas une seconde trace', async () => {
  await demande()
  expect(
    (await db.query('select demander_complement($1,$2) ok', [piece, 'incorrect'])).rows[0],
  ).toEqual({ ok: false })
  expect(
    (await db.query<{ id: string }>('select id from complements_documentaires')).rows,
  ).toHaveLength(1)
})

test('un remplacement trop court ne compte pas les bulletins invalides de l ancienne piece', async () => {
  const id = await demande(),
    nouveau = await ajouter('bulletin_paie', 1)
  await devenirPorteur(db, dossier, 'garant')
  await db.query('select fournir_complement($1,$2)', [id, nouveau])
  await devenir(db, 'authenticated', membre)
  await db.query('select valider_complement($1)', [id])
  expect(await etat()).toBe('depot_en_cours')
})
test('une correction refusee exige un nouveau fichier et conserve la trace', async () => {
  const id = await demande(),
    nouveau = await ajouter()
  await devenirPorteur(db, dossier, 'garant')
  await db.query('select fournir_complement($1,$2)', [id, nouveau])
  await devenir(db, 'authenticated', membre)
  expect((await db.query('select refuser_complement($1) ok', [id])).rows[0]).toEqual({ ok: true })
  await devenirPorteur(db, dossier, 'garant')
  expect((await db.query('select fournir_complement($1,$2) ok', [id, nouveau])).rows[0]).toEqual({
    ok: false,
  })
  expect(
    (await db.query("select action from journal_acces where action='complement_refuse'")).rows,
  ).toHaveLength(1)
})

for (const role of ['anon', 'porteur_lien', 'serveur'] as const)
  test(`le role ${role} ne peut pas demander ni valider`, async () => {
    await devenir(db, role)
    expect(
      (
        await db.query(
          "select has_function_privilege(current_user,'public.demander_complement(uuid,text)','EXECUTE') ok",
        )
      ).rows[0],
    ).toEqual({ ok: false })
    expect(
      (
        await db.query(
          "select has_function_privilege(current_user,'public.valider_complement(uuid)','EXECUTE') ok",
        )
      ).rows[0],
    ).toEqual({ ok: false })
  })
test('les roles applicatifs ne peuvent pas ecrire directement une demande', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien', 'serveur']) {
    expect(
      (
        await db.query(
          "select has_table_privilege($1,'public.complements_documentaires','INSERT,UPDATE,DELETE') ok",
          [role],
        )
      ).rows[0],
    ).toEqual({ ok: false })
  }
})
test('un garant ne peut pas reutiliser un remplacement pour deux demandes', async () => {
  const second = await ajouter()
  const id = await demande()
  await db.query('select demander_complement($1,$2)', [second, 'incorrect'])
  const demandes = (
    await db.query<{ id: string }>('select id from complements_documentaires where id<>$1', [id])
  ).rows
  const nouveau = await ajouter()
  await devenirPorteur(db, dossier, 'garant')
  await db.query('select fournir_complement($1,$2)', [id, nouveau])
  expect(
    (await db.query('select fournir_complement($1,$2) ok', [demandes[0]!.id, nouveau])).rows[0],
  ).toEqual({ ok: false })
})

test('les notifications de complement sont durables et deviennent obsoletes apres examen', async () => {
  const id = await demande()
  await devenir(db, 'serveur')
  let notifications = (
    await db.query<{ dossier: { statut: string } }>('select * from notifications_a_livrer($1)', [
      dossier,
    ])
  ).rows
  expect(notifications.some((n) => n.dossier.statut === 'complement_demande')).toBe(true)
  const nouveau = await ajouter()
  await devenirPorteur(db, dossier, 'garant')
  await db.query('select fournir_complement($1,$2)', [id, nouveau])
  await devenir(db, 'serveur')
  notifications = (
    await db.query<{ dossier: { statut: string } }>('select * from notifications_a_livrer($1)', [
      dossier,
    ])
  ).rows
  expect(notifications.some((n) => n.dossier.statut === 'complement_demande')).toBe(false)
  expect(notifications.some((n) => n.dossier.statut === 'complement_fourni')).toBe(true)
  await devenir(db, 'authenticated', membre)
  await db.query('select valider_complement($1)', [id])
  await devenir(db, 'serveur')
  notifications = (
    await db.query<{ dossier: { statut: string } }>('select * from notifications_a_livrer($1)', [
      dossier,
    ])
  ).rows
  expect(notifications.some((n) => n.dossier.statut.startsWith('complement_'))).toBe(false)
})

test('une autre agence ne demande pas un premier complement et ne valide pas un remplacement pret', async () => {
  await devenir(db, 'authenticated', randomUUID())
  expect(
    (await db.query('select demander_complement($1,$2) ok', [piece, 'incorrect'])).rows[0],
  ).toEqual({ ok: false })
  const id = await demande(),
    nouveau = await ajouter()
  await devenirPorteur(db, dossier, 'garant')
  await db.query('select fournir_complement($1,$2)', [id, nouveau])
  await devenir(db, 'authenticated', randomUUID())
  expect((await db.query('select valider_complement($1) ok', [id])).rows[0]).toEqual({ ok: false })
  expect((await db.query('select refuser_complement($1) ok', [id])).rows[0]).toEqual({ ok: false })
  await redevenirProprietaire(db)
  expect(
    (await db.query('select etat from complements_documentaires where id=$1', [id])).rows[0],
  ).toEqual({ etat: 'fourni' })
})
test('une agence suspendue ne rouvre aucun depot', async () => {
  await db.query("update agences set statut='suspendue' where id=$1", [agence])
  await devenir(db, 'authenticated', membre)
  expect(
    (await db.query('select demander_complement($1,$2) ok', [piece, 'incorrect'])).rows[0],
  ).toEqual({ ok: false })
})
