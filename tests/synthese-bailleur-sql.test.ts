import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'

import { donneesSynthese } from '@/lib/dossiers/synthese-bailleur'

import {
  baseDEssai,
  devenir,
  devenirPorteur,
  redevenirProprietaire,
  reserverObjetDEssai,
} from './base'

/**
 * La synthese pour le bailleur, cote base (0089) : qui peut la demander, ce
 * qu'elle rend, et ce qu'elle laisse au journal. Les refus d'abord.
 */
let db: PGlite, dossier: string, agence: string, membre: string, bulletin: string, avis: string

async function piece(type: string, documents = 1) {
  const leDossier = dossier
  const id = randomUUID()
  await reserverObjetDEssai(db, leDossier, `${leDossier}/${id}`)
  await db.query(
    "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel,nombre_documents) values($1,$2,$3,$4,100,'application/pdf',$5)",
    [id, leDossier, type, `${leDossier}/${id}`, documents],
  )
  return id
}

beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  dossier = randomUUID()
  agence = randomUUID()
  membre = randomUUID()
  await db.query(
    "insert into agences(id,nom,domaine,seuil_ratio) values($1,'Agence des Lilas','synthese.invalid',2.85)",
    [agence],
  )
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'membre@synthese.invalid',now())",
    [membre],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [agence, membre],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,locataire_nom,loyer_cents,statut) values($1,$2,'locataire@example.invalid','Camille Durand',100000,'complet')",
    [dossier, agence],
  )
  await db.query(
    `insert into engagements(dossier_id,nom,prenom,couvre,montant_max_cents,solidaire,revenu_net_mensuel_cents,ratio,calcule_le)
     values($1,'Durand','Dominique','loyer_charges',3600000,true,320000,3.20,now())
     on conflict(dossier_id) do update set nom=excluded.nom,prenom=excluded.prenom,
     montant_max_cents=excluded.montant_max_cents,revenu_net_mensuel_cents=excluded.revenu_net_mensuel_cents,
     ratio=excluded.ratio,calcule_le=excluded.calcule_le`,
    [dossier],
  )
  bulletin = await piece('bulletin_paie', 2)
  avis = await piece('avis_imposition')
  await db.query(
    "insert into examens_documentaires(dossier_id,piece_id,etat,acteur_id) values($1,$2,'a_revoir',$3),($1,$2,'examine',$3)",
    [dossier, bulletin, membre],
  )
  // Les depots recalculent le statut : on le fixe en dernier.
  await db.query("update dossiers set statut='complet' where id=$1", [dossier])
  expect((await db.query('select statut from dossiers where id=$1', [dossier])).rows[0]).toEqual({
    statut: 'complet',
  })
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

async function preparer(id = dossier) {
  return (
    await db.query<{ s: Record<string, unknown> | null }>(
      'select preparer_synthese_bailleur($1) s',
      [id],
    )
  ).rows[0]!.s
}
async function traces() {
  await redevenirProprietaire(db)
  return (
    await db.query<{ acteur: string; acteur_id: string; dossier_id: string; piece_id: null }>(
      "select acteur,acteur_id,dossier_id,piece_id from journal_acces where action='synthese_bailleur'",
    )
  ).rows
}

test.each(['anon', 'serveur', 'service_role', 'depot_piece', 'porteur_lien', 'archive_signature'])(
  'le role %s ne peut pas demander la synthese',
  async (role) => {
    await db.exec(`set local role ${role}`)
    await expect(preparer()).rejects.toThrow(/permission denied/)
  },
)

test.each(['garant', 'locataire'])(
  'le %s ne peut pas la demander avec son lien',
  async (partie) => {
    await devenirPorteur(db, dossier, partie)
    await expect(preparer()).rejects.toThrow(/permission denied/)
  },
)

test('une autre agence ne recoit rien et ne laisse aucune trace', async () => {
  const autreAgence = randomUUID(),
    etranger = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Autre','autre.invalid')", [
    autreAgence,
  ])
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'x@autre.invalid',now())",
    [etranger],
  )
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [autreAgence, etranger],
  )
  await devenir(db, 'authenticated', etranger)
  expect(await preparer()).toBeNull()
  expect(await preparer(randomUUID())).toBeNull()
  expect(await traces()).toEqual([])
})

test('sans second facteur, la session ne recoit rien', async () => {
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ role: 'authenticated', sub: membre, aal: 'aal1' }),
  ])
  expect(await preparer()).toBeNull()
  expect(await traces()).toEqual([])
})

test.each(['ouvert', 'depot_en_cours', 'refuse', 'expire'])(
  'un dossier %s ne donne pas de synthese',
  async (statut) => {
    await db.query('update dossiers set statut=$2 where id=$1', [dossier, statut])
    await devenir(db, 'authenticated', membre)
    expect(await preparer()).toBeNull()
    expect(await traces()).toEqual([])
  },
)

test('un dossier echu ne donne pas de synthese, meme si la purge tarde', async () => {
  await db.query(
    "update dossiers set cree_le=now()-interval '2 days',expire_le=now()-interval '1 minute' where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', membre)
  expect(await preparer()).toBeNull()
  expect(await traces()).toEqual([])
})

test('la synthese rend le ratio, les pieces et leur dernier examen, et laisse une trace nominative', async () => {
  await devenir(db, 'authenticated', membre)
  const s = await preparer()
  expect(s).toMatchObject({
    statut: 'complet',
    demonstration: false,
    locataire: 'Camille Durand',
    loyer_cents: 100000,
    agence: 'Agence des Lilas',
    seuil: 2.85,
    groupe: null,
    acte: null,
    engagement: {
      garant: 'Dominique Durand',
      couvre: 'loyer_charges',
      plafond_cents: 3600000,
      solidaire: true,
      ratio: 3.2,
    },
  })
  const pieces = s!.pieces as { type: string; documents: number; examen: string | null }[]
  expect(pieces.map((p) => [p.type, p.documents, p.examen])).toEqual([
    ['bulletin_paie', 2, 'examine'],
    ['avis_imposition', 1, null],
  ])
  // Ce que la base rend est exactement ce que la page sait lire.
  expect(donneesSynthese.safeParse(s).success).toBe(true)
  expect(await traces()).toEqual([
    { acteur: 'agence', acteur_id: membre, dossier_id: dossier, piece_id: null },
  ])
})

test('le revenu du garant ne sort jamais, sous aucun nom', async () => {
  await devenir(db, 'authenticated', membre)
  const texte = JSON.stringify(await preparer())
  expect(texte).not.toMatch(/revenu/i)
  expect(texte).not.toContain('320000')
  expect(texte).not.toContain('3200')
  // Ni l'adresse du garant, ni celle du locataire, ni un identifiant de piece.
  expect(texte).not.toContain('example.invalid')
  expect(texte).not.toContain(bulletin)
  expect(texte).not.toContain(avis)
})

test('une piece ecartee par un remplacement ne figure plus dans la synthese', async () => {
  await db.query(
    "insert into complements_documentaires(dossier_id,piece_initiale,pieces_ecartees,nature,motif,demande_par) values($1,$2,array[$2::uuid],'avis_imposition','illisible',$3)",
    [dossier, avis, membre],
  )
  await devenir(db, 'authenticated', membre)
  const pieces = (await preparer())!.pieces as { type: string }[]
  expect(pieces.map((p) => p.type)).toEqual(['bulletin_paie'])
})

test('la onzieme synthese de l heure est refusee, sans trace de plus', async () => {
  await devenir(db, 'authenticated', membre)
  for (let i = 0; i < 10; i++) expect(await preparer()).not.toBeNull()
  expect(await preparer()).toBeNull()
  expect(await traces()).toHaveLength(10)
})

test('le journal du dossier reste en ecriture seule pour qui a telecharge', async () => {
  await devenir(db, 'authenticated', membre)
  await preparer()
  await expect(
    db.query("delete from journal_acces where action='synthese_bailleur'"),
  ).rejects.toThrow()
})
