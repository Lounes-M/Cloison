import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { baseDEssai, devenir, redevenirProprietaire, refus as refusBrut } from './base'

/**
 * Le connecteur Apimo en base (0096) : qui configure, qui lit le scelle, quel
 * dossier se relie, et quel retour d'etat est du. Les refus d'abord.
 */
let db: PGlite, agence: string, admin: string, membre: string, dossier: string
let autreAgence: string, autreAdmin: string, autreDossier: string
const SCELLE = 'A'.repeat(80)
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
async function creerAgence(domaine: string) {
  const a = randomUUID(),
    u = randomUUID(),
    d = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Essai',$2)", [a, domaine])
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
    u,
    `admin@${domaine}`,
  ])
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [a, u],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,loyer_cents,statut) values($1,$2,'locataire@example.invalid',90000,'ouvert')",
    [d, a],
  )
  return [a, u, d] as const
}
beforeEach(async () => {
  await db.exec('begin')
  ;[agence, admin, dossier] = await creerAgence('apimo.invalid')
  ;[autreAgence, autreAdmin, autreDossier] = await creerAgence('autre-apimo.invalid')
  membre = randomUUID()
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'membre@apimo.invalid',now())",
    [membre],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'membre')",
    [agence, membre],
  )
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
/** Un refus leve annule la transaction de l'essai : chaque tentative a son point de reprise. */
async function refus(base: PGlite, sql: string) {
  await base.exec('savepoint tentative')
  try {
    return await refusBrut(base, sql)
  } finally {
    await base.exec('rollback to savepoint tentative')
  }
}
const un = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<{ r: T }>(sql, params)).rows[0]!.r
const configurer = (retour = true, scelle = SCELLE, fournisseur = '4242', a = '777') =>
  un<boolean>('select configurer_apimo($1,$2,$3,$4) r', [fournisseur, a, scelle, retour])
const acces = () => un<Record<string, unknown> | null>('select acces_apimo() r')
const lier = (d = dossier, bien = '12', bail: string | null = null) =>
  un<boolean>('select lier_dossier_apimo($1,$2,$3) r', [d, bien, bail])
type Retour = Record<string, string | null>
async function reserver(combien = 20) {
  await devenir(db, 'serveur')
  return un<Retour[]>('select reserver_retours_apimo($1) r', [combien])
}
const confirmer = (issue: string, etat = 'a_completer', d = dossier) =>
  un<boolean>('select confirmer_retour_apimo($1,$2,$3) r', [d, etat, issue])
async function preparer(retour = true) {
  await devenir(db, 'authenticated', admin)
  expect(await configurer(retour)).toBe(true)
  expect(await lier()).toBe(true)
}
async function plusTard(duree: string) {
  await redevenirProprietaire(db)
  await db.query(
    `update liens_apimo set prochaine_tentative=prochaine_tentative-interval '${duree}'`,
  )
}

test.each(['anon', 'porteur_lien', 'serveur', 'service_role', 'depot_piece'])(
  '%s ne configure, ne lit et ne relie rien',
  async (role) => {
    await db.exec(`set role ${role}`)
    for (const appel of [
      `select configurer_apimo('1','2','${SCELLE}',true)`,
      'select regler_retour_apimo(true)',
      'select retirer_apimo()',
      'select acces_apimo()',
      "select noter_apimo('ok')",
      "select logement_du_bien_apimo('1','Bien',null)",
      `select lier_dossier_apimo('${dossier}','1',null)`,
      'select * from connexions_apimo',
      'select * from liens_apimo',
      'select * from logements_apimo',
    ])
      expect(await refus(db, appel)).toMatch(/permission denied/)
  },
)
test.each(['anon', 'authenticated', 'porteur_lien', 'service_role', 'depot_piece'])(
  '%s ne reserve ni ne confirme aucun retour',
  async (role) => {
    await db.exec(`set role ${role}`)
    expect(await refus(db, 'select reserver_retours_apimo(1)')).toMatch(/permission denied/)
    expect(await refus(db, `select confirmer_retour_apimo('${dossier}','clos','envoye')`)).toMatch(
      /permission denied/,
    )
    expect(await refus(db, "select etat_retour_apimo('signe')")).toMatch(/permission denied/)
  },
)

test('le scelle ne se lit par aucun role, pas meme par son administrateur', async () => {
  await devenir(db, 'authenticated', admin)
  expect(await configurer()).toBe(true)
  expect(await refus(db, 'select jeton_scelle from connexions_apimo')).toMatch(/permission denied/)
  expect(await refus(db, 'select * from connexions_apimo')).toMatch(/permission denied/)
  expect(
    (await db.query('select fournisseur,agence_apimo,retour_statut,echec from connexions_apimo'))
      .rows,
  ).toEqual([{ fournisseur: '4242', agence_apimo: '777', retour_statut: true, echec: null }])
  for (const ecriture of [
    "update connexions_apimo set fournisseur='1'",
    'delete from connexions_apimo',
    `insert into connexions_apimo(agence_id,fournisseur,agence_apimo,jeton_scelle) values('${agence}','1','2','${SCELLE}')`,
    "update liens_apimo set etat_envoye='signe'",
    `insert into liens_apimo(dossier_id,agence_id,bien_apimo) values('${dossier}','${agence}','1')`,
  ])
    expect(await refus(db, ecriture)).toMatch(/permission denied/)
})

test('seul un administrateur sous MFA configure, regle et retire', async () => {
  await devenir(db, 'authenticated', membre)
  expect(await configurer()).toBe(false)
  expect(await un('select regler_retour_apimo(true) r')).toBe(false)
  expect(await un('select retirer_apimo() r')).toBe(false)
  // Sans second facteur, l'agence courante n'existe pas.
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ role: 'authenticated', sub: admin, aal: 'aal1' }),
  ])
  expect(await configurer()).toBe(false)
  await devenir(db, 'authenticated', admin)
  expect(await configurer(false)).toBe(true)
  expect(await un('select regler_retour_apimo(true) r')).toBe(true)
  // Le membre voit l'etat, jamais le scelle, et peut lire via la fonction.
  await devenir(db, 'authenticated', membre)
  expect((await db.query('select retour_statut from connexions_apimo')).rows).toEqual([
    { retour_statut: true },
  ])
  expect(await acces()).toMatchObject({ agence, jeton_scelle: SCELLE })
  await devenir(db, 'authenticated', admin)
  expect(await un('select retirer_apimo() r')).toBe(true)
  expect(await un('select retirer_apimo() r')).toBe(false)
  expect(await acces()).toBeNull()
})

test.each([
  ['', '777', SCELLE],
  ['42a', '777', SCELLE],
  ['12345678901', '777', SCELLE],
  ['4242', '7 7', SCELLE],
  ['4242', '777', 'court'],
  ['4242', '777', `${'A'.repeat(79)}!`],
  ['4242', '777', 'A'.repeat(1500)],
  [null, '777', SCELLE],
])('refuse la configuration %j %j', async (fournisseur, a, scelle) => {
  await devenir(db, 'authenticated', admin)
  expect(await un('select configurer_apimo($1,$2,$3,true) r', [fournisseur, a, scelle])).toBe(false)
  expect((await db.query('select 1 from connexions_apimo')).rows).toEqual([])
})

test('une agence ne voit ni ne touche la connexion d une autre', async () => {
  await devenir(db, 'authenticated', admin)
  expect(await configurer()).toBe(true)
  expect(await lier()).toBe(true)
  await devenir(db, 'authenticated', autreAdmin)
  expect((await db.query('select 1 from connexions_apimo')).rows).toEqual([])
  expect((await db.query('select 1 from liens_apimo')).rows).toEqual([])
  expect(await acces()).toBeNull()
  expect(await un('select retirer_apimo() r')).toBe(false)
  expect(await un("select noter_apimo('refus') r")).toBe(false)
  // Sans connexion propre, rien ne se relie ; avec, jamais le dossier d'autrui.
  expect(await lier(autreDossier)).toBe(false)
  expect(await configurer(true, 'B'.repeat(80), '99', '88')).toBe(true)
  expect(await lier(dossier, '13')).toBe(false)
  expect(await acces()).toMatchObject({ agence: autreAgence, jeton_scelle: 'B'.repeat(80) })
  await devenir(db, 'authenticated', admin)
  expect(await acces()).toMatchObject({ agence, fournisseur: '4242', jeton_scelle: SCELLE })
})

test('les lectures sont comptees : soixante par dix minutes et par agence', async () => {
  await devenir(db, 'authenticated', admin)
  expect(await configurer()).toBe(true)
  for (let i = 0; i < 60; i++) expect(await acces()).toHaveProperty('jeton_scelle')
  expect(await acces()).toEqual({ limite: true })
  await devenir(db, 'authenticated', membre)
  expect(await acces()).toEqual({ limite: true })
})

test('vingt configurations par jour au plus', async () => {
  await devenir(db, 'authenticated', admin)
  for (let i = 0; i < 20; i++) expect(await configurer()).toBe(true)
  expect(await configurer()).toBe(false)
})

test('le dernier resultat se note, et une nouvelle configuration l efface', async () => {
  await devenir(db, 'authenticated', admin)
  expect(await un("select noter_apimo('ok') r")).toBe(false)
  expect(await configurer()).toBe(true)
  await devenir(db, 'authenticated', membre)
  expect(await un("select noter_apimo('refus') r")).toBe(true)
  expect(await un("select noter_apimo('n importe quoi') r")).toBe(false)
  expect((await db.query('select echec from connexions_apimo')).rows).toEqual([{ echec: 'refus' }])
  expect(await un("select noter_apimo('ok') r")).toBe(true)
  expect((await db.query('select echec,echec_le from connexions_apimo')).rows).toEqual([
    { echec: null, echec_le: null },
  ])
})

test('un meme bien rend le meme logement, sans reecrire celui de l agence', async () => {
  await devenir(db, 'authenticated', membre)
  expect(await un("select logement_du_bien_apimo('12','T2',85000) r")).toBeNull()
  await devenir(db, 'authenticated', admin)
  expect(await configurer()).toBe(true)
  await devenir(db, 'authenticated', membre)
  const premier = await un<string>(
    "select logement_du_bien_apimo('12',' T2 Croix-Rousse ',85000) r",
  )
  expect(premier).toMatch(/^[0-9a-f-]{36}$/)
  await db.query("update logements set libelle='Corrige par l agence' where id=$1", [premier])
  expect(await un("select logement_du_bien_apimo('12','Autre libelle',99000) r")).toBe(premier)
  expect((await db.query('select libelle,loyer_cents::int from logements')).rows).toEqual([
    { libelle: 'Corrige par l agence', loyer_cents: 85000 },
  ])
  expect(await un("select logement_du_bien_apimo('13','T3',null) r")).not.toBe(premier)
  for (const [bien, libelle, loyer] of [
    ['1a', 'T2', 1],
    ['12', '', 1],
    ['12', 'x'.repeat(121), 1],
    ['14', 'T2', 0],
    ['14', 'T2', 10000001],
  ])
    expect(await un('select logement_du_bien_apimo($1,$2,$3) r', [bien, libelle, loyer])).toBeNull()
  // L'autre agence a son propre logement pour le meme numero de bien.
  await devenir(db, 'authenticated', autreAdmin)
  expect(await configurer(true, SCELLE, '99', '88')).toBe(true)
  expect(await un("select logement_du_bien_apimo('12','T2',85000) r")).not.toBe(premier)
  expect((await db.query('select bien_apimo from logements_apimo')).rows).toEqual([
    { bien_apimo: '12' },
  ])
})

test('un dossier se relie une fois, jamais un second garant ni une demonstration', async () => {
  await devenir(db, 'authenticated', admin)
  expect(await lier()).toBe(false)
  expect(await configurer()).toBe(true)
  for (const [bien, bail] of [
    ['', null],
    ['12a', null],
    ['12', 'bail avec espace'],
    ['12', '-commence-mal'],
    ['12', 'x'.repeat(41)],
  ])
    expect(await lier(dossier, bien as string, bail)).toBe(false)
  expect(await lier(dossier, '12', 'B-2026/014')).toBe(true)
  expect(await lier(dossier, '13')).toBe(false)
  expect(
    (await db.query('select bien_apimo,bail_apimo,etat_envoye from liens_apimo')).rows,
  ).toEqual([{ bien_apimo: '12', bail_apimo: 'B-2026/014', etat_envoye: null }])
  await redevenirProprietaire(db)
  const second = randomUUID(),
    demo = randomUUID(),
    expire = randomUUID()
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,statut,dossier_principal) values($1,$2,'locataire@example.invalid','ouvert',$3)",
    [second, agence, dossier],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,statut,demonstration) values($1,$2,'locataire@example.invalid','ouvert',true)",
    [demo, agence],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,statut,cree_le,expire_le) values($1,$2,'locataire@example.invalid','ouvert',now()-interval '100 days',now()-interval '1 day')",
    [expire, agence],
  )
  await devenir(db, 'authenticated', admin)
  for (const d of [second, demo, expire, randomUUID()]) expect(await lier(d)).toBe(false)
})

test('aucun retour sans le choix de l agence, sans connexion ou agence suspendue', async () => {
  await preparer(false)
  expect(await reserver()).toEqual([])
  await devenir(db, 'authenticated', admin)
  expect(await un('select regler_retour_apimo(true) r')).toBe(true)
  await redevenirProprietaire(db)
  await db.query("update agences set statut='suspendue' where id=$1", [agence])
  expect(await reserver()).toEqual([])
  await redevenirProprietaire(db)
  await db.query("update agences set statut='decouverte' where id=$1", [agence])
  await db.query('delete from connexions_apimo where agence_id=$1', [agence])
  expect(await reserver()).toEqual([])
  for (const combien of [0, 51, null]) expect(await reserver(combien as number)).toEqual([])
})

test('le retour ne porte que la reference et l etat neutre', async () => {
  await preparer()
  const [retour, ...reste] = await reserver()
  expect(reste).toEqual([])
  expect(Object.keys(retour!).sort()).toEqual(
    [
      'agence',
      'agence_apimo',
      'bail',
      'bien',
      'dossier',
      'etat',
      'fournisseur',
      'jeton_scelle',
      'reference',
    ].sort(),
  )
  expect(retour).toMatchObject({ dossier, etat: 'a_completer', bien: '12', agence })
  expect(JSON.stringify(retour)).not.toMatch(/locataire@|90000|loyer|email/)
})

test.each([
  ['ouvert', 'a_completer'],
  ['garant_insuffisant', 'a_completer'],
  ['complet', 'pret'],
  ['transmis', 'en_cours'],
  ['signe', 'signe'],
  ['refuse', 'clos'],
  ['expire', 'clos'],
])('le statut %s se rend %s, comme dans l API de statuts', async (statut, etat) => {
  await redevenirProprietaire(db)
  expect(await un('select etat_retour_apimo($1) r', [statut])).toBe(etat)
})

test('un etat inscrit ne repart pas ; un nouvel etat du dossier repart', async () => {
  await preparer()
  expect(await reserver()).toHaveLength(1)
  // Reserve : il ne se reserve pas deux fois, meme le delai passe.
  await plusTard('2 days')
  expect(await reserver()).toEqual([])
  expect(await confirmer('envoye')).toBe(true)
  expect(await confirmer('envoye')).toBe(false)
  await plusTard('2 days')
  expect(await reserver()).toEqual([])
  await redevenirProprietaire(db)
  expect(
    (await db.query('select etat_envoye,envoye_le is not null ok,incertain from liens_apimo')).rows,
  ).toEqual([{ etat_envoye: 'a_completer', ok: true, incertain: false }])
  await db.query("update dossiers set statut='complet' where id=$1", [dossier])
  await plusTard('2 days')
  expect(await reserver()).toMatchObject([{ dossier, etat: 'pret' }])
  // Une confirmation pour un autre etat que celui reserve ne compte pas.
  expect(await confirmer('envoye', 'signe')).toBe(false)
  expect(await confirmer('envoye', 'pret')).toBe(true)
})

test('un refus net se retente six fois avec un delai qui double, puis s arrete', async () => {
  await preparer()
  for (let essai = 1; essai <= 6; essai++) {
    expect(await reserver()).toHaveLength(1)
    expect(await confirmer('refuse')).toBe(true)
    // Avant le delai, rien.
    expect(await reserver()).toEqual([])
    await redevenirProprietaire(db)
    const { rows } = await db.query<{ tentatives: number; minutes: number }>(
      'select tentatives,round(extract(epoch from prochaine_tentative-clock_timestamp())/60)::int minutes from liens_apimo',
    )
    expect(rows[0]).toEqual({ tentatives: essai, minutes: 15 * 2 ** (essai - 1) })
    await plusTard('30 days')
  }
  expect(await reserver()).toEqual([])
  // Le dossier change d'etat : le compteur repart.
  await redevenirProprietaire(db)
  await db.query("update dossiers set statut='signe' where id=$1", [dossier])
  expect(await reserver()).toMatchObject([{ etat: 'signe' }])
})

test('une issue inconnue, ou un serveur tombe en route, ne se rejoue pas', async () => {
  await preparer()
  expect(await reserver()).toHaveLength(1)
  // Aucune confirmation : le serveur est tombe apres la reservation.
  await plusTard('30 days')
  expect(await reserver()).toEqual([])
  expect(await confirmer('incertain')).toBe(true)
  await plusTard('30 days')
  expect(await reserver()).toEqual([])
  await redevenirProprietaire(db)
  expect((await db.query('select etat_envoye,incertain from liens_apimo')).rows).toEqual([
    { etat_envoye: null, incertain: true },
  ])
  await db.query("update dossiers set statut='transmis' where id=$1", [dossier])
  expect(await reserver()).toMatchObject([{ etat: 'en_cours' }])
  expect(await confirmer('n importe quoi', 'en_cours')).toBe(false)
})

test('le lot est borne et deux cycles ne prennent pas le meme dossier', async () => {
  await preparer()
  await redevenirProprietaire(db)
  for (let i = 0; i < 4; i++) {
    const d = randomUUID()
    await db.query(
      "insert into dossiers(id,agence_id,email_locataire,statut) values($1,$2,'locataire@example.invalid','complet')",
      [d, agence],
    )
    await db.query('insert into liens_apimo(dossier_id,agence_id,bien_apimo) values($1,$2,$3)', [
      d,
      agence,
      String(20 + i),
    ])
  }
  const premier = await reserver(3)
  const second = await reserver(3)
  expect(premier).toHaveLength(3)
  expect(second).toHaveLength(2)
  const tous = [...premier, ...second].map((r) => r.dossier)
  expect(new Set(tous).size).toBe(5)
})

test('le lien part avec le dossier, la connexion et les liens avec l agence', async () => {
  await preparer()
  await redevenirProprietaire(db)
  await db.query("select logement_du_bien_apimo('1','x',null)").catch(() => {})
  await db.query('delete from dossiers where id=$1', [dossier])
  expect((await db.query('select 1 from liens_apimo')).rows).toEqual([])
  await db.query('insert into liens_apimo(dossier_id,agence_id,bien_apimo) values($1,$2,$3)', [
    autreDossier,
    autreAgence,
    '1',
  ])
  await db.query('delete from dossiers where agence_id=$1', [autreAgence])
  await db.query('delete from agences where id=$1', [autreAgence])
  expect((await db.query('select 1 from liens_apimo')).rows).toEqual([])
  expect(autreAdmin).toBeTruthy()
})
