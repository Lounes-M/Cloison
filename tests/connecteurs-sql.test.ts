import { beforeAll, beforeEach, afterEach, afterAll, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
let db: PGlite, agence: string, membre: string, cle: string
const empreinte = 'a'.repeat(64)
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
  await db.query(
    "insert into agences(id,nom,domaine) values($1,'Connecteur','connecteur.invalid')",
    [agence],
  )
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'admin@connecteur.invalid',now())",
    [membre],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, membre],
  )
  await db.query(
    "insert into dossiers(agence_id,reference,email_locataire,loyer_cents) values($1,'REFERENCE0001','prive@example.invalid',100000)",
    [agence],
  )
  await devenir(db, 'authenticated', membre)
  cle = (
    await db.query<{ id: string }>('select creer_connecteur($1,$2) id', ['Logiciel', empreinte])
  ).rows[0]!.id
  expect(cle).toBeTruthy()
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function lire(hash = empreinte, apres: string | null = null) {
  await devenir(db, 'serveur')
  return (await db.query<{ r: unknown }>('select lire_statuts_connecteur($1,$2) r', [hash, apres]))
    .rows[0]!.r
}
test('ne rend que les references et etats de sa propre agence', async () => {
  await redevenirProprietaire(db)
  const autre = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Autre','autre.invalid')", [autre])
  await db.query(
    "insert into dossiers(agence_id,reference,email_locataire,loyer_cents) values($1,'AUTRE0000001','tiers@example.invalid',999999)",
    [autre],
  )
  expect(await lire()).toEqual({
    version: 1,
    dossiers: [{ reference: 'REFERENCE0001', etat: 'a_completer' }],
    suite: null,
  })
})
test.each(['anon', 'authenticated', 'porteur_lien', 'depot_piece', 'service_role'])(
  'le role %s ne peut pas appeler la projection',
  async (role) => {
    await db.exec(`set local role ${role}`)
    await expect(db.query('select lire_statuts_connecteur($1)', [empreinte])).rejects.toThrow(
      /permission denied/,
    )
  },
)
test('meme un administrateur ne lit pas les empreintes stockees', async () => {
  expect((await db.query('select id,nom from connecteurs_agence')).rows).toEqual([
    { id: cle, nom: 'Logiciel' },
  ])
  await expect(db.query('select empreinte from connecteurs_agence')).rejects.toThrow(
    /permission denied/,
  )
})
test('une autre personne ne voit pas les acces et ne peut ni creer ni revoquer', async () => {
  await devenir(db, 'authenticated', randomUUID())
  expect((await db.query('select id from connecteurs_agence')).rows).toEqual([])
  expect(
    (await db.query('select creer_connecteur($1,$2) id', ['Autre', 'b'.repeat(64)])).rows[0],
  ).toEqual({ id: null })
  expect((await db.query('select revoquer_connecteur($1) ok', [cle])).rows[0]).toEqual({
    ok: false,
  })
})
test('un membre sans droit admin ne gere pas les cles', async () => {
  await redevenirProprietaire(db)
  const u = randomUUID()
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'membre@connecteur.invalid',now())",
    [u],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'membre')",
    [agence, u],
  )
  await devenir(db, 'authenticated', u)
  expect(
    (await db.query('select creer_connecteur($1,$2) id', ['Autre', 'b'.repeat(64)])).rows[0],
  ).toEqual({ id: null })
  expect((await db.query('select revoquer_connecteur($1) ok', [cle])).rows[0]).toEqual({
    ok: false,
  })
})
test('une cle expiree, revoquee ou inconnue ne donne rien', async () => {
  expect(await lire('b'.repeat(64))).toBeNull()
  await devenir(db, 'authenticated', membre)
  expect((await db.query('select revoquer_connecteur($1) ok', [cle])).rows[0]).toEqual({ ok: true })
  const avant = (await db.query('select revoque_le from connecteurs_agence where id=$1', [cle]))
    .rows[0]
  expect((await db.query('select revoquer_connecteur($1) ok', [cle])).rows[0]).toEqual({ ok: true })
  expect(
    (await db.query('select revoque_le from connecteurs_agence where id=$1', [cle])).rows[0],
  ).toEqual(avant)
  expect(await lire()).toBeNull()
  await redevenirProprietaire(db)
  await db.query(
    "update connecteurs_agence set revoque_le=null,cree_le=now()-interval '91 days',expire_le=now()-interval '1 day' where id=$1",
    [cle],
  )
  expect(await lire()).toBeNull()
})
test.each(['suspension', 'identite', 'expiration_dossier'])(
  'respecte %s au moment de chaque lecture',
  async (cas) => {
    await redevenirProprietaire(db)
    if (cas === 'suspension')
      await db.query("update agences set statut='suspendue' where id=$1", [agence])
    if (cas === 'identite')
      await db.query('update auth.users set email_confirmed_at=null where id=$1', [membre])
    if (cas === 'expiration_dossier')
      await db.query(
        "update dossiers set cree_le=now()-interval '100 days',expire_le=now()-interval '1 day' where agence_id=$1",
        [agence],
      )
    expect(await lire()).toEqual(
      cas === 'expiration_dossier' ? { version: 1, dossiers: [], suite: null } : null,
    )
  },
)
test('borne le debit de chaque cle', async () => {
  await redevenirProprietaire(db)
  await db.query(
    "update connecteurs_agence set fenetre=date_bin(interval '1 minute',clock_timestamp(),timestamptz 'epoch'),compte=60 where id=$1",
    [cle],
  )
  expect(await lire()).toEqual({ limite: true })
})
test('limite les acces actifs a cinq', async () => {
  for (const h of ['b', 'c', 'd', 'e'])
    expect(
      (await db.query('select creer_connecteur($1,$2) id', ['Logiciel', h.repeat(64)])).rows[0],
    ).not.toEqual({ id: null })
  expect(
    (await db.query('select creer_connecteur($1,$2) id', ['De trop', 'f'.repeat(64)])).rows[0],
  ).toEqual({ id: null })
})
test('borne aussi les creations successives apres revocation', async () => {
  await redevenirProprietaire(db)
  await db.query(
    "insert into connecteurs_agence(agence_id,nom,empreinte,cree_par,revoque_le) select $1,'Ancien',repeat(md5(i::text),2),$2,clock_timestamp() from generate_series(1,19) i",
    [agence, membre],
  )
  await devenir(db, 'authenticated', membre)
  expect(
    (await db.query('select creer_connecteur($1,$2) id', ['De trop', 'f'.repeat(64)])).rows[0],
  ).toEqual({ id: null })
})
test('le renouvellement de minute remet le debit a zero', async () => {
  await redevenirProprietaire(db)
  await db.query(
    "update connecteurs_agence set fenetre=clock_timestamp()-interval '2 minutes',compte=60 where id=$1",
    [cle],
  )
  expect(await lire()).toEqual({
    version: 1,
    dossiers: [{ reference: 'REFERENCE0001', etat: 'a_completer' }],
    suite: null,
  })
})
test('la gestion exige encore le MFA apres creation', async () => {
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ role: 'authenticated', sub: membre, aal: 'aal1' }),
  ])
  expect((await db.query('select id from connecteurs_agence')).rows).toEqual([])
  expect(
    (await db.query('select creer_connecteur($1,$2) id', ['Autre', 'b'.repeat(64)])).rows[0],
  ).toEqual({ id: null })
  expect((await db.query('select revoquer_connecteur($1) ok', [cle])).rows[0]).toEqual({
    ok: false,
  })
})
test('un administrateur ne peut pas modifier la table directement', async () => {
  await expect(
    db.query("update connecteurs_agence set nom='Contourne' where id=$1", [cle]),
  ).rejects.toThrow(/permission denied/)
})
test('une readmission ne reactive pas une cle apres exclusion', async () => {
  await redevenirProprietaire(db)
  const second = randomUUID()
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'second@connecteur.invalid',now())",
    [second],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, second],
  )
  await db.query('delete from membres_agence where utilisateur_id=$1', [membre])
  expect(await lire()).toBeNull()
  await devenir(db, 'authenticated', second)
  expect((await db.query('select readmettre_collaborateur($1) ok', [membre])).rows[0]).toEqual({
    ok: true,
  })
  await redevenirProprietaire(db)
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'membre')",
    [agence, membre],
  )
  expect(await lire()).toBeNull()
})
test('pagine sans doublon et ignore les parametres invalides', async () => {
  await redevenirProprietaire(db)
  for (let i = 2; i <= 52; i++)
    await db.query(
      "insert into dossiers(agence_id,reference,email_locataire) values($1,$2,'fictif@example.invalid')",
      [agence, 'REFERENCE' + String(i).padStart(4, '0')],
    )
  const p = (await lire()) as { dossiers: unknown[]; suite: string }
  expect(p.dossiers).toHaveLength(50)
  expect(p.suite).toBe('REFERENCE0050')
  expect(await lire(empreinte, p.suite)).toEqual({
    version: 1,
    dossiers: [
      { reference: 'REFERENCE0051', etat: 'a_completer' },
      { reference: 'REFERENCE0052', etat: 'a_completer' },
    ],
    suite: null,
  })
  expect(await lire(empreinte, 'x')).toBeNull()
})
