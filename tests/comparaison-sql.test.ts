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

/**
 * La reservation est le controle d'acces de la comparaison : rien n'est
 * dechiffre sans elle. Elle choisit elle-meme les pieces, et seulement des
 * justificatifs de revenus.
 */
let db: PGlite, dossier: string, agence: string, membre: string
const pieces: Record<string, string> = {}
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
async function deposer(type: string, cle = type, age = '0 minutes') {
  const id = randomUUID()
  pieces[cle] = id
  await reserverObjetDEssai(db, dossier, `${dossier}/${id}`)
  await db.query(
    `insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel,depose_le) values($1,$2,$3,$4,100,'application/pdf',now()-interval '${age}')`,
    [id, dossier, type, `${dossier}/${id}`],
  )
  return id
}
beforeEach(async () => {
  await db.exec('begin')
  dossier = randomUUID()
  agence = randomUUID()
  membre = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Essai','ecart.invalid')", [agence])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'membre@ecart.invalid',now())",
    [membre],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, membre],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,loyer_cents,statut) values($1,$2,'locataire@example.invalid',100000,'complet')",
    [dossier, agence],
  )
  await db.query('insert into engagements(dossier_id,revenu_net_mensuel_cents) values($1,300000)', [
    dossier,
  ])
  await deposer('bulletin_paie', 'bulletin_paie', '3 minutes')
  await deposer('pension_retraite', 'pension_retraite', '2 minutes')
  await deposer('piece_identite')
  await deposer('avis_imposition')
  await deposer('justificatif_domicile')
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
type Reservation = { declare_cents: number; pieces: string[] } | null
async function reserver(id = dossier) {
  return (await db.query<{ r: Reservation }>('select reserver_comparaison_revenus($1) r', [id]))
    .rows[0]!.r
}
async function lignes() {
  await redevenirProprietaire(db)
  return (
    await db.query<{ acteur: string; acteur_id: string; piece_id: string }>(
      "select acteur,acteur_id,piece_id from journal_acces where action='comparaison_revenus' order by piece_id",
    )
  ).rows
}

test.each(['anon', 'porteur_lien', 'serveur', 'service_role', 'depot_piece'])(
  'le role %s ne peut pas reserver',
  async (role) => {
    await db.exec(`set local role ${role}`)
    await expect(reserver()).rejects.toThrow(/permission denied/)
  },
)

test('un membre reserve : la declaration, les seuls justificatifs de revenus, une ligne par piece', async () => {
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).toEqual({
    declare_cents: 300000,
    // La plus recente d'abord ; ni identite, ni domicile, ni avis d'imposition.
    pieces: [pieces.pension_retraite, pieces.bulletin_paie],
  })
  expect(await lignes()).toEqual(
    [pieces.bulletin_paie, pieces.pension_retraite]
      .sort()
      .map((piece_id) => ({ acteur: 'agence', acteur_id: membre, piece_id })),
  )
})

test('quatre pieces au plus, les plus recentes', async () => {
  for (let i = 0; i < 4; i++) await deposer('bulletin_paie', `recent${i}`, `${i} seconds`)
  await devenir(db, 'authenticated', membre)
  const reserve = await reserver()
  expect(reserve!.pieces).toHaveLength(4)
  expect([...reserve!.pieces].sort()).toEqual(
    [pieces.recent0, pieces.recent1, pieces.recent2, pieces.recent3].sort(),
  )
  expect(await lignes()).toHaveLength(4)
})

test('une piece ecartee par un complement ne part pas', async () => {
  await db.query(
    "insert into complements_documentaires(dossier_id,piece_initiale,pieces_ecartees,nature,motif,demande_par) values($1,$2,array[$2::uuid],'bulletin_paie','illisible',$3)",
    [dossier, pieces.bulletin_paie, membre],
  )
  await devenir(db, 'authenticated', membre)
  expect((await reserver())!.pieces).toEqual([pieces.pension_retraite])
})

test('sans revenu declare ou sans justificatif de revenus, rien ne part ni ne se journalise', async () => {
  await db.query('update engagements set revenu_net_mensuel_cents=null where dossier_id=$1', [
    dossier,
  ])
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).toBeNull()
  await redevenirProprietaire(db)
  await db.query('update engagements set revenu_net_mensuel_cents=300000 where dossier_id=$1', [
    dossier,
  ])
  await db.query(
    "update pieces set type='contrat_travail' where dossier_id=$1 and type in ('bulletin_paie','pension_retraite')",
    [dossier],
  )
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).toBeNull()
  expect(await lignes()).toEqual([])
})

test('une agence etrangere, une session sans MFA et le garant sont refuses', async () => {
  await devenir(db, 'authenticated', randomUUID())
  expect(await reserver()).toBeNull()
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ role: 'authenticated', sub: membre, aal: 'aal1' }),
  ])
  expect(await reserver()).toBeNull()
  expect(await lignes()).toEqual([])
  // En dernier : le refus de permission interrompt la transaction de l'essai.
  await devenirPorteur(db, dossier, 'garant')
  await expect(reserver()).rejects.toThrow(/permission denied/)
})

test('un dossier absent, expire ou pas encore complet est refuse', async () => {
  await devenir(db, 'authenticated', membre)
  expect(await reserver(randomUUID())).toBeNull()
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set cree_le=now()-interval '100 days',expire_le=now()-interval '1 day' where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).toBeNull()
  await redevenirProprietaire(db)
  // Avant un premier dossier complet, l'agence ne lit aucune piece (0087).
  await db.query(
    "update dossiers set cree_le=now(),expire_le=now()+interval '1 day',complet_le=null where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).toBeNull()
  expect(await lignes()).toEqual([])
})

test('chaque piece compte : la septieme comparaison de deux pieces est refusee en entier', async () => {
  await devenir(db, 'authenticated', membre)
  for (let i = 0; i < 6; i++) expect(await reserver()).not.toBeNull()
  expect(await reserver()).toBeNull()
  expect(await lignes()).toHaveLength(12)
})

test('le budget global des lectures par IA est partage et respecte', async () => {
  await db.query(
    "insert into debits(cle,fenetre,compte) values('ocr:global:partage',date_bin(interval '10 minutes',clock_timestamp(),timestamptz 'epoch'),99)",
  )
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).toBeNull()
  expect(await lignes()).toEqual([])
})

test('rien n est ecrit dans le dossier : ni engagement, ni statut, ni examen', async () => {
  const avant = async () =>
    (
      await db.query(
        `select d.statut,d.complet_le,to_jsonb(e) engagement,
         (select count(*)::int from examens_documentaires x where x.dossier_id=d.id) examens
         from dossiers d join engagements e on e.dossier_id=d.id where d.id=$1`,
        [dossier],
      )
    ).rows[0]
  const etat = await avant()
  await devenir(db, 'authenticated', membre)
  expect(await reserver()).not.toBeNull()
  await redevenirProprietaire(db)
  expect(await avant()).toEqual(etat)
})
