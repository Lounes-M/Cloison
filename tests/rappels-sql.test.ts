import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
let db: PGlite, admin: string, membre: string, dossier: string, agence: string
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  await db.exec(
    readFileSync('supabase/essais/responsables.sql', 'utf8').split(
      'set local role authenticated;',
    )[0]!,
  )
  const r = (
    await db.query<{ a: string; m: string; d: string; g: string }>(
      "select current_setting('cloison.responsable_admin') a,current_setting('cloison.responsable_premier') m,current_setting('cloison.responsable_dossier') d,current_setting('cloison.responsable_agence') g",
    )
  ).rows[0]!
  admin = r.a
  membre = r.m
  dossier = r.d
  agence = r.g
  await db.query("update agences set siren='123456789',carte_pro='TEST' where id=$1", [agence])
  await db.query("update agences set statut='verifiee',verifiee_le=now() where id=$1", [agence])
  await db.query(
    "update dossiers set statut='depot_en_cours',email_garant='garant@example.invalid',cree_le=now()-interval '20 days',expire_le=now()+interval '2 days' where id=$1",
    [dossier],
  )
  await vieillir()
  await devenir(db, 'authenticated', admin)
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function vieillir() {
  await db.query("update dossiers set activite_rappel_le=now()-interval '8 days' where id=$1", [
    dossier,
  ])
}
test('le lot de verification des droits reels est executable en transaction', async () => {
  await redevenirProprietaire(db)
  await db.exec(readFileSync('supabase/essais/rappels.sql', 'utf8'))
})
async function regler(
  relance: number | null = 3,
  echeance: number | null = 0,
  revision: string | null = null,
) {
  return (
    await db.query<{ r: string | null }>('select regler_rappels($1,$2,$3) r', [
      relance,
      echeance,
      revision,
    ])
  ).rows[0]!.r
}
async function programmer() {
  await devenir(db, 'serveur')
  return (await db.query<{ n: number }>('select programmer_rappels() n')).rows[0]!.n
}
async function preparer() {
  await devenir(db, 'serveur')
  return (
    await db.query<{ id: string; email: string; nature: string }>(
      'select * from rappels_a_preparer()',
    )
  ).rows
}
async function enfiler() {
  const r = (await preparer())[0]!
  expect(
    (await db.query<{ s: string }>("select mettre_rappel_en_file($1,'chiffre-fictif') s", [r.id]))
      .rows[0]!.s,
  ).toBe('prepare')
  return r.id
}
async function prendre(id: string) {
  await devenir(db, 'serveur')
  return (
    await db.query<{ id: string; bail: string; rappel_id: string }>(
      'select * from prendre_courriels($1)',
      [id],
    )
  ).rows
}
async function confirmer(id: string, bail: string | null) {
  await devenir(db, 'serveur')
  return (await db.query<{ s: string }>('select confirmer_rappel_avant_envoi($1,$2) s', [id, bail]))
    .rows[0]!.s
}
test('desactive par defaut, revision obsolete refusee sans ecrasement', async () => {
  expect((await db.query('select * from reglages_rappels_agence()')).rows).toEqual([
    { relance_jours: 0, echeance_jours: 0, revision: null },
  ])
  expect(await programmer()).toBe(0)
  await devenir(db, 'authenticated', admin)
  const r = await regler()
  expect(r).toBeTruthy()
  expect(await regler(7, 3)).toBeNull()
  expect((await db.query('select * from reglages_rappels_agence()')).rows).toEqual([
    { relance_jours: 3, echeance_jours: 0, revision: r },
  ])
  expect(await regler(7, 3, r)).not.toBe(r)
})
test.each([
  [null, 3],
  [2, 0],
  [3, null],
  [3, 14],
  [-1, 0],
])('refuse les delais %s/%s', async (a, b) => {
  expect(await regler(a!, b!)).toBeNull()
})
test('un membre ne lit ni ne modifie les reglages', async () => {
  await regler()
  await devenir(db, 'authenticated', membre)
  expect(await regler()).toBeNull()
  expect((await db.query('select * from reglages_rappels_agence()')).rows).toEqual([])
  expect((await db.query('select * from reglages_rappels')).rows).toEqual([])
})
test('refuse un administrateur sans MFA', async () => {
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: admin, aal: 'aal1' }),
  ])
  expect(await regler()).toBeNull()
  expect((await db.query('select * from reglages_rappels_agence()')).rows).toEqual([])
})
test.each(['anon', 'authenticated', 'porteur_lien', 'depot_piece', 'service_role'])(
  'le role %s ne lit ni ne programme les destinataires',
  async (role) => {
    await db.exec(`set local role ${role}`)
    for (const sql of [
      'select * from rappels_dossiers',
      'select programmer_rappels()',
      'select * from rappels_a_preparer()',
      "select mettre_rappel_en_file(gen_random_uuid(),'x')",
      'select confirmer_rappel_avant_envoi(gen_random_uuid(),gen_random_uuid())',
      'select rappel_encore_valide(gen_random_uuid())',
    ]) {
      await db.exec('savepoint droits')
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
      await db.exec('rollback to droits')
    }
  },
)
test('un administrateur ne contourne pas la revision par une ecriture directe', async () => {
  await regler()
  await expect(db.query('update reglages_rappels set relance_jours=7')).rejects.toThrow(
    /permission denied/,
  )
})
test('un meme passage ne duplique rien et l inactivite persistante permet une seconde relance', async () => {
  await regler()
  expect(await programmer()).toBe(1)
  expect(await programmer()).toBe(0)
  await redevenirProprietaire(db)
  await db.query("update rappels_dossiers set cree_le=now()-interval '4 days'")
  expect(await programmer()).toBe(1)
})
test('trois rappels maximum et trois jours minimum entre deux activites', async () => {
  await regler()
  expect(await programmer()).toBe(1)
  for (let i = 1; i <= 3; i++) {
    await redevenirProprietaire(db)
    await db.query('update dossiers set revision_rappel=gen_random_uuid() where id=$1', [dossier])
    expect(await programmer()).toBe(0)
    await redevenirProprietaire(db)
    await db.query("update rappels_dossiers set cree_le=now()-interval '4 days'")
    expect(await programmer()).toBe(i < 3 ? 1 : 0)
  }
})
test.each(['refuse', 'signe', 'expire', 'transmis'])(
  'aucune relance de depot au statut %s',
  async (statut) => {
    await regler()
    await redevenirProprietaire(db)
    await db.query('update dossiers set statut=$1 where id=$2', [statut, dossier])
    await vieillir()
    expect(await programmer()).toBe(0)
  },
)
test.each(['demonstration', 'expiration', 'agence', 'activite', 'sans-email'])(
  'aucune relance pour %s',
  async (cas) => {
    await regler()
    await redevenirProprietaire(db)
    if (cas === 'demonstration')
      await db.query('update dossiers set demonstration=true where id=$1', [dossier])
    if (cas === 'expiration')
      await db.query("update dossiers set expire_le=now()-interval '1 second' where id=$1", [
        dossier,
      ])
    if (cas === 'agence')
      await db.query("update agences set statut='decouverte' where id=$1", [agence])
    if (cas === 'activite')
      await db.query('update dossiers set activite_rappel_le=now() where id=$1', [dossier])
    if (cas === 'sans-email') {
      await db.query('update dossiers set email_garant=null where id=$1', [dossier])
      await vieillir()
    }
    expect(await programmer()).toBe(0)
  },
)
test('un rappel obsolete avant preparation ne conserve aucun courriel', async () => {
  await regler()
  await programmer()
  const r = (await preparer())[0]!
  await redevenirProprietaire(db)
  await db.query('update dossiers set revision_rappel=gen_random_uuid() where id=$1', [dossier])
  expect(await preparer()).toEqual([])
  expect(
    (await db.query<{ s: string }>("select mettre_rappel_en_file($1,'x') s", [r.id])).rows[0]!.s,
  ).toBe('obsolete')
  await redevenirProprietaire(db)
  expect((await db.query('select * from courriels_sortants where id=$1', [r.id])).rows).toEqual([])
})
test.each(['activite', 'email', 'desactivation', 'expiration'])(
  'annule le courriel deja prepare apres %s',
  async (cas) => {
    const revision = await regler()
    await programmer()
    const id = await enfiler()
    await redevenirProprietaire(db)
    if (cas === 'activite')
      await db.query('update dossiers set revision_rappel=gen_random_uuid() where id=$1', [dossier])
    if (cas === 'email')
      await db.query("update dossiers set email_garant='autre@example.invalid' where id=$1", [
        dossier,
      ])
    if (cas === 'expiration')
      await db.query("update dossiers set expire_le=now()-interval '1 second' where id=$1", [
        dossier,
      ])
    if (cas === 'desactivation') {
      await devenir(db, 'authenticated', admin)
      await regler(0, 0, revision)
    }
    expect(await prendre(id)).toEqual([])
    await redevenirProprietaire(db)
    expect(
      (
        await db.query(
          'select contenu,bail,envoye_le,annule_le is not null annule from courriels_sortants where id=$1',
          [id],
        )
      ).rows,
    ).toEqual([{ contenu: null, bail: null, envoye_le: null, annule: true }])
  },
)
test('une activite apres la prise de bail interdit encore l envoi', async () => {
  await regler()
  await programmer()
  const id = await enfiler()
  const c = (await prendre(id))[0]!
  expect(c.rappel_id).toBe(id)
  expect(await confirmer(id, c.bail)).toBe('pret')
  await redevenirProprietaire(db)
  await db.query('update dossiers set revision_rappel=gen_random_uuid() where id=$1', [dossier])
  expect(await confirmer(id, c.bail)).toBe('annule')
})
test.each(['absent', 'autre', 'expire', 'sans-echeance'])(
  'un bail %s ne peut confirmer le rappel',
  async (cas) => {
    await regler()
    await programmer()
    const id = await enfiler()
    const c = (await prendre(id))[0]!
    await redevenirProprietaire(db)
    if (cas === 'expire')
      await db.query(
        "update courriels_sortants set bail_expire_le=now()-interval '1 second' where id=$1",
        [id],
      )
    if (cas === 'sans-echeance')
      await db.query('update courriels_sortants set bail_expire_le=null where id=$1', [id])
    expect(await confirmer(id, cas === 'absent' ? null : cas === 'autre' ? admin : c.bail)).toBe(
      'refuse',
    )
  },
)
test('les echeances respectent les preferences et affectations actuelles', async () => {
  await regler(0, 3)
  await devenir(db, 'authenticated', membre)
  await db.query("select regler_notifications('mes')")
  expect(await programmer()).toBe(2)
  await devenir(db, 'authenticated', admin)
  await db.query('select affecter_dossier($1,$2)', [dossier, membre])
  expect(await programmer()).toBe(1)
  expect(await preparer()).toHaveLength(3)
  await redevenirProprietaire(db)
  await db.query('delete from membres_agence where utilisateur_id=$1', [membre])
  expect(await preparer()).toHaveLength(2)
})
test.each(['aucun', 'domaine', 'confirmation', 'affectation'])(
  'un changement %s invalide une echeance prise en bail',
  async (cas) => {
    await regler(0, 3)
    await programmer()
    const r = (await preparer()).find((r) => r.email.startsWith(membre))!
    await db.query("select mettre_rappel_en_file($1,'x')", [r.id])
    const c = (await prendre(r.id))[0]!
    await redevenirProprietaire(db)
    if (cas === 'domaine')
      await db.query("update auth.users set email='autre@example.invalid' where id=$1", [membre])
    if (cas === 'confirmation')
      await db.query('update auth.users set email_confirmed_at=null where id=$1', [membre])
    if (cas === 'aucun' || cas === 'affectation') {
      await devenir(db, 'authenticated', membre)
      await db.query('select regler_notifications($1)', [cas === 'aucun' ? 'aucun' : 'mes'])
    }
    expect(await confirmer(r.id, c.bail)).toBe('annule')
  },
)
test('la suppression du dossier efface aussi le courriel chiffre', async () => {
  await regler()
  await programmer()
  const id = await enfiler()
  await redevenirProprietaire(db)
  await db.query('delete from dossiers where id=$1', [dossier])
  expect((await db.query('select * from rappels_dossiers')).rows).toEqual([])
  expect((await db.query('select * from courriels_sortants where id=$1', [id])).rows).toEqual([])
})

test.each(['engagement', 'complement', 'piece'])(
  'une modification %s reporte le rappel et invalide la revision',
  async (cas) => {
    await regler()
    await programmer()
    const id = await enfiler()
    await redevenirProprietaire(db)
    const avant = (
      await db.query<{ r: string }>('select revision_rappel r from dossiers where id=$1', [dossier])
    ).rows[0]!.r
    if (cas === 'engagement')
      await db.query(
        'insert into engagements(dossier_id) values($1) on conflict(dossier_id) do update set solidaire=false',
        [dossier],
      )
    if (cas === 'complement')
      await db.query(
        "insert into complements_documentaires(dossier_id,piece_initiale,pieces_ecartees,nature,motif) values($1,gen_random_uuid(),'{}','piece_identite','illisible')",
        [dossier],
      )
    if (cas === 'piece') {
      const piece = (await db.query<{ id: string }>('select gen_random_uuid() id')).rows[0]!.id
      const chemin = `${dossier}/${piece}`
      await db.query('insert into reservations_depot(chemin,dossier_id) values($1,$2)', [
        chemin,
        dossier,
      ])
      await db.query("insert into storage.objects(bucket_id,name) values('pieces',$1)", [chemin])
      await db.query(
        "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values($1,$2,'piece_identite',$3,100,'application/pdf')",
        [piece, dossier, chemin],
      )
    }
    const apres = (
      await db.query<{ r: string; recent: boolean }>(
        "select revision_rappel r,activite_rappel_le>now()-interval '1 minute' recent from dossiers where id=$1",
        [dossier],
      )
    ).rows[0]!
    expect(apres.r).not.toBe(avant)
    expect(apres.recent).toBe(true)
    expect(await prendre(id)).toEqual([])
  },
)
test('un complement attendu permet de relancer un dossier complet mais un dossier complet seul ne le permet pas', async () => {
  await regler()
  await redevenirProprietaire(db)
  await db.query("update dossiers set statut='complet' where id=$1", [dossier])
  await vieillir()
  expect(await programmer()).toBe(0)
  await redevenirProprietaire(db)
  await db.query(
    "insert into complements_documentaires(dossier_id,piece_initiale,pieces_ecartees,nature,motif) values($1,gen_random_uuid(),'{}','piece_identite','illisible')",
    [dossier],
  )
  await vieillir()
  expect(await programmer()).toBe(1)
})
async function semerCompteurs(n: number, g: string, d: string) {
  await db.query(
    `insert into rappels_dossiers(cle,dossier_id,agence_id,nature,revision_dossier,empreinte_email,expiration_dossier,expire_le)
 select encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),$2,$1,'echeance',gen_random_uuid(),repeat('a',64),now()+interval '2 days',now()+interval '1 day' from generate_series(1,$3::integer)`,
    [g, d, n],
  )
}
test('le quota agence interdit une cinquante et unieme entree', async () => {
  await regler()
  await redevenirProprietaire(db)
  await semerCompteurs(50, agence, dossier)
  expect(await programmer()).toBe(0)
})
test('le quota global interdit une deux cent unieme entree meme dans une agence encore vide', async () => {
  await regler()
  await redevenirProprietaire(db)
  const g = (
    await db.query<{ id: string }>(
      "insert into agences(nom,domaine) values('Autre','quota.invalid') returning id",
    )
  ).rows[0]!.id
  const d = (
    await db.query<{ id: string }>(
      "insert into dossiers(agence_id,email_locataire,loyer_cents) values($1,'quota@example.invalid',100000) returning id",
      [g],
    )
  ).rows[0]!.id
  await semerCompteurs(200, g, d)
  expect(await programmer()).toBe(0)
})
test('vingt entrees par passage puis les suivantes sans famine due aux doublons', async () => {
  await regler(0, 3)
  await redevenirProprietaire(db)
  await db.query(
    "insert into dossiers(agence_id,email_locataire,loyer_cents,expire_le) select $1,'quota@example.invalid',100000,now()+interval '2 days' from generate_series(1,8)",
    [agence],
  )
  expect(await programmer()).toBe(20)
  expect(await programmer()).toBe(7)
  expect(await programmer()).toBe(0)
  expect(await preparer()).toHaveLength(20)
  for (const r of await preparer()) await db.query("select mettre_rappel_en_file($1,'x')", [r.id])
  expect(await preparer()).toHaveLength(7)
})
