import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'

/**
 * Le tableau de bord de l'agence (0099) : des nombres et des references que
 * l'agence lit deja, rien d'une autre agence, rien d'une personne.
 */

let db: PGlite, agence: string, admin: string, autreAgence: string, autre: string

beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})

async function creerAgence(domaine: string) {
  const a = randomUUID()
  const u = randomUUID()
  await db.query('insert into agences(id,nom,domaine) values($1,$2,$2)', [a, domaine])
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
    u,
    `admin@${domaine}`,
  ])
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [a, u],
  )
  return [a, u] as const
}

beforeEach(async () => {
  await db.exec('begin')
  ;[agence, admin] = await creerAgence('pilotage.invalid')
  ;[autreAgence, autre] = await creerAgence('autre-pilotage.invalid')
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

type Colonnes = Record<string, string | number | boolean | null>

/** Un dossier complet en apparence : garant designe, loyer declare. */
async function dossier(colonnes: Colonnes = {}, a = agence) {
  const id = randomUUID()
  const tout: Colonnes = {
    email_garant: 'garant@example.invalid',
    loyer_cents: 90000,
    ...colonnes,
  }
  const noms = Object.keys(tout)
  await db.query(
    `insert into dossiers(id,agence_id,email_locataire,locataire_nom,cree_le${noms.map((n) => ',' + n).join('')})
     values($1,$2,'camille.secret@example.invalid','Camille Secret',now()-interval '10 days'${noms.map((_, i) => `,$${i + 3}`).join('')})`,
    [id, a, ...Object.values(tout)],
  )
  return id
}

/** Plus rien n'a bouge depuis `jours` jours. */
async function vieillir(id: string, jours: number) {
  await db.query(
    'update dossiers set activite_rappel_le=now()-make_interval(days=>$2) where id=$1',
    [id, jours],
  )
}

async function relance(id: string, nature: 'depot' | 'locataire', jours = 0, a = agence) {
  const r = (
    await db.query<{ id: string }>(
      `insert into rappels_dossiers(cle,dossier_id,agence_id,nature,motif,revision_dossier,empreinte_email,expiration_dossier,expire_le,cree_le)
       values(encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),$1,$2,$3,$4,gen_random_uuid(),repeat('a',64),now()+interval '2 days',now()+interval '1 day',now()-make_interval(days=>$5))
       returning id`,
      [id, a, nature, nature === 'locataire' ? 'garant' : null, jours],
    )
  ).rows[0]!.id
  await db.query(
    "insert into courriels_sortants(id,contenu,expire_le,rappel_id) values($1,'chiffre-fictif',now()+interval '1 day',$1)",
    [r],
  )
}

type Synthese = {
  etapes: Record<string, number>
  en_cours: number
  echeances_proches: number
  bloques: number
  blocages: Record<string, number>
  attendus: Record<string, number>
  seuils: Record<string, number>
}
async function synthese(qui = admin) {
  await devenir(db, 'authenticated', qui)
  const { rows } = await db.query<{ p: Synthese | null }>('select pilotage_de_mon_agence() p')
  await redevenirProprietaire(db)
  return rows[0]!.p
}
type Bloque = {
  id: string
  reference: string
  statut: string
  motif: string
  attend: string
  depuis: Date
  echeance_proche: boolean
}
async function bloques(qui = admin) {
  await devenir(db, 'authenticated', qui)
  const { rows } = await db.query<Bloque>('select * from dossiers_bloques_de_mon_agence()')
  await redevenirProprietaire(db)
  return rows
}
async function mensuel(qui = admin) {
  await devenir(db, 'authenticated', qui)
  const { rows } = await db.query<Record<string, unknown>>(
    'select * from pilotage_mensuel_de_mon_agence()',
  )
  await redevenirProprietaire(db)
  return rows
}

test('les dossiers en cours se comptent par etape, sans demonstration, second garant ni echu', async () => {
  await dossier()
  await dossier({ statut: 'depot_en_cours' })
  await dossier({ statut: 'depot_en_cours' })
  await dossier({ statut: 'complet' })
  await dossier({ statut: 'transmis' })
  await dossier({ statut: 'signe' })
  await dossier({ statut: 'refuse' })
  // Hors du compte.
  await dossier({ demonstration: true })
  const principal = await dossier()
  await dossier({ dossier_principal: principal })
  const echu = await dossier({ statut: 'complet' })
  await db.query(
    "update dossiers set cree_le=now()-interval '40 days',expire_le=now()-interval '1 hour' where id=$1",
    [echu],
  )
  await dossier({ statut: 'complet' }, autreAgence)

  const s = (await synthese())!
  expect(s.etapes).toEqual({
    ouvert: 2,
    depot_en_cours: 2,
    complet: 1,
    garant_insuffisant: 0,
    transmis: 1,
    signe: 1,
    refuse: 1,
  })
  expect(s.en_cours).toBe(6)
  expect(s.seuils).toEqual({ agence: 2, locataire: 3, garant: 7, signataires: 7 })
})

test('chaque blocage porte son motif et la partie attendue', async () => {
  const cas: Record<string, string> = {}
  cas.garant_non_designe = await dossier({ email_garant: null })
  cas.loyer_non_declare = await dossier({ statut: 'depot_en_cours', loyer_cents: null })
  cas.paiement = await dossier({ rattache_par_locataire: true })
  cas.depot_inacheve = await dossier({ statut: 'depot_en_cours' })
  cas.decision_attendue = await dossier({ statut: 'complet' })
  cas.a_revoir = await dossier({ statut: 'garant_insuffisant' })
  cas.signature_attendue = await dossier({ statut: 'transmis' })
  cas.complement_attendu = await dossier({ statut: 'depot_en_cours' })
  await db.query(
    "insert into complements_documentaires(dossier_id,piece_initiale,pieces_ecartees,nature,motif,demande_par) values($1,gen_random_uuid(),'{}','bulletin_paie','illisible',$2)",
    [cas.complement_attendu, admin],
  )
  for (const id of Object.values(cas)) await vieillir(id, 8)

  const lignes = await bloques()
  const par = Object.fromEntries(lignes.map((l) => [l.id, l]))
  const attendu: [string, string, string][] = [
    ['garant_non_designe', 'garant_non_designe', 'locataire'],
    ['loyer_non_declare', 'loyer_non_declare', 'locataire'],
    ['paiement', 'paiement', 'locataire'],
    ['depot_inacheve', 'depot_inacheve', 'garant'],
    ['complement_attendu', 'complement_attendu', 'garant'],
    ['decision_attendue', 'decision_attendue', 'agence'],
    ['a_revoir', 'decision_attendue', 'agence'],
    ['signature_attendue', 'signature_attendue', 'signataires'],
  ]
  for (const [cle, motif, attend] of attendu)
    expect(par[cas[cle]!], cle).toMatchObject({ motif, attend })
  expect(lignes).toHaveLength(8)

  const s = (await synthese())!
  expect(s.bloques).toBe(8)
  expect(s.blocages).toMatchObject({
    paiement: 1,
    garant_non_designe: 1,
    loyer_non_declare: 1,
    depot_inacheve: 1,
    complement_attendu: 1,
    decision_attendue: 2,
    signature_attendue: 1,
    relances_epuisees: 0,
    remplacement_a_examiner: 0,
  })
  expect(s.attendus).toEqual({ agence: 2, locataire: 3, garant: 2, signataires: 1 })
  // Les compteurs s'additionnent : un seul motif par dossier.
  expect(Object.values(s.blocages).reduce((a, b) => a + b, 0)).toBe(s.bloques)
})

test('un dossier ne bloque qu a partir du seuil de la partie attendue', async () => {
  const agenceLente = await dossier({ statut: 'complet' })
  const agenceVive = await dossier({ statut: 'complet' })
  const locataire = await dossier({ email_garant: null })
  const garantRecent = await dossier({ statut: 'depot_en_cours' })
  const garantAncien = await dossier({ statut: 'depot_en_cours' })
  await vieillir(agenceLente, 3)
  await vieillir(agenceVive, 1)
  await vieillir(locataire, 2)
  await vieillir(garantRecent, 6)
  await vieillir(garantAncien, 7)
  expect((await bloques()).map((l) => l.id).sort()).toEqual([agenceLente, garantAncien].sort())
  // La plus ancienne inactivite d'abord.
  expect((await bloques())[0]!.id).toBe(garantAncien)
})

test('les relances epuisees bloquent sans seuil, et une reprise les debloque', async () => {
  const id = await dossier({ statut: 'depot_en_cours' })
  await vieillir(id, 6)
  await relance(id, 'depot', 5)
  await relance(id, 'depot', 3)
  expect(await bloques()).toEqual([])
  await relance(id, 'depot', 1)
  expect(await bloques()).toMatchObject([{ id, motif: 'relances_epuisees', attend: 'garant' }])
  // Meme regle que la carte de priorite (0077, 0079).
  await devenir(db, 'authenticated', admin)
  const cartes = await db.query<{ id: string }>('select id from dossiers_relances_epuisees() id')
  await redevenirProprietaire(db)
  expect(cartes.rows.map((l) => l.id)).toEqual([id])

  await db.query('update dossiers set relances_depuis=now() where id=$1', [id])
  expect(await bloques()).toEqual([])
})

test('une piece de remplacement a examiner passe avant tout autre motif', async () => {
  const id = await dossier({ statut: 'depot_en_cours', loyer_cents: null })
  await db.query(
    "insert into complements_documentaires(dossier_id,piece_initiale,pieces_ecartees,nature,motif,demande_par,etat,piece_fournie,fourni_le) values($1,gen_random_uuid(),'{}','bulletin_paie','illisible',$2,'fourni',gen_random_uuid(),now())",
    [id, admin],
  )
  await vieillir(id, 2)
  expect(await bloques()).toMatchObject([
    { id, motif: 'remplacement_a_examiner', attend: 'agence' },
  ])
})

test('l echeance proche est signalee sur la ligne et dans la synthese', async () => {
  const id = await dossier({ statut: 'complet' })
  await db.query("update dossiers set expire_le=now()+interval '3 days' where id=$1", [id])
  await dossier({ statut: 'signe' }).then((signe) =>
    db.query("update dossiers set expire_le=now()+interval '3 days' where id=$1", [signe]),
  )
  await vieillir(id, 4)
  expect(await bloques()).toMatchObject([{ id, echeance_proche: true }])
  expect((await synthese())!.echeances_proches).toBe(1)
})

test('la liste ne porte que des colonnes neutres', async () => {
  const id = await dossier({ statut: 'complet' })
  await vieillir(id, 5)
  const [ligne] = await bloques()
  expect(Object.keys(ligne!).sort()).toEqual([
    'attend',
    'depuis',
    'echeance_proche',
    'id',
    'motif',
    'reference',
    'statut',
  ])
  const tout = JSON.stringify([await bloques(), await synthese(), await mensuel()])
  for (const interdit of ['camille', 'Secret', 'garant@', 'example.invalid', '90000'])
    expect(tout).not.toContain(interdit)
})

test('une agence ne lit rien d une autre', async () => {
  const mien = await dossier({ statut: 'complet' })
  const leur = await dossier({ statut: 'transmis' }, autreAgence)
  await vieillir(mien, 9)
  await vieillir(leur, 9)
  await relance(leur, 'depot', 0, autreAgence)

  expect((await bloques()).map((l) => l.id)).toEqual([mien])
  expect((await bloques(autre)).map((l) => l.id)).toEqual([leur])
  expect((await synthese())!.etapes).toMatchObject({ complet: 1, transmis: 0 })
  expect((await synthese(autre))!.etapes).toMatchObject({ complet: 0, transmis: 1 })
  expect((await mensuel())[0]).toMatchObject({ relances_garant: 0 })
  expect((await mensuel(autre))[0]).toMatchObject({ relances_garant: 1 })
})

test('sans agence, sans second facteur ou agence suspendue : rien', async () => {
  const id = await dossier({ statut: 'complet' })
  await vieillir(id, 9)

  const inconnu = randomUUID()
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'x@pilotage.invalid',now())",
    [inconnu],
  )
  expect(await synthese(inconnu)).toBeNull()
  expect(await bloques(inconnu)).toEqual([])
  expect(await mensuel(inconnu)).toEqual([])

  // Un seul facteur : `agence_courante()` ne rend rien.
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ role: 'authenticated', sub: admin, aal: 'aal1' }),
  ])
  expect(
    (await db.query<{ p: unknown }>('select pilotage_de_mon_agence() p')).rows[0]!.p,
  ).toBeNull()
  expect((await db.query('select * from dossiers_bloques_de_mon_agence()')).rows).toEqual([])
  await redevenirProprietaire(db)

  await db.query("update agences set statut='suspendue' where id=$1", [agence])
  expect(await synthese()).toBeNull()
  expect(await bloques()).toEqual([])
})

test('les delais se cumulent par mois et survivent a la purge', async () => {
  const id = await dossier()
  await db.query("update dossiers set statut='depot_en_cours' where id=$1", [id])
  await db.query("update dossiers set statut='complet' where id=$1", [id])
  // Retour en depot puis de nouveau complet : la premiere completude seule compte.
  await db.query("update dossiers set statut='depot_en_cours' where id=$1", [id])
  await db.query("update dossiers set statut='complet' where id=$1", [id])
  await db.query("update dossiers set statut='transmis' where id=$1", [id])
  await db.query("update dossiers set statut='signe' where id=$1", [id])
  await relance(id, 'depot')
  await relance(id, 'depot')
  await relance(id, 'locataire')

  const lire = async () => (await mensuel())[0]
  expect(await lire()).toMatchObject({
    ouverts: 1,
    complets: 1,
    delai_complet_moyen_jours: '10.0',
    signes: 1,
    signatures_mesurees: 1,
    delai_signature_moyen_jours: '10.0',
    relances_garant: 2,
    relances_locataire: 1,
  })
  expect(await mensuel()).toHaveLength(12)

  // Un dossier refuse part a la purge ; ses compteurs restent.
  const refuse = await dossier()
  await db.query("update dossiers set statut='complet' where id=$1", [refuse])
  await db.query("update dossiers set statut='refuse' where id=$1", [refuse])
  await relance(refuse, 'depot')
  await db.query(
    "update dossiers set cree_le=now()-interval '100 days',expire_le=now()-interval '1 second' where id=$1",
    [refuse],
  )
  await db.query('select purger_les_dossiers_expires()')
  expect((await db.query('select 1 from dossiers where id=$1', [refuse])).rows).toEqual([])
  expect(
    (await db.query('select 1 from rappels_dossiers where dossier_id=$1', [refuse])).rows,
  ).toEqual([])
  expect(await lire()).toMatchObject({ complets: 2, signes: 1, relances_garant: 3 })
})

test('un dossier deja complet a son rattachement n entre pas dans le delai', async () => {
  const id = randomUUID()
  await db.query(
    "insert into dossiers(id,email_locataire,statut) values($1,'seul@example.invalid','complet')",
    [id],
  )
  await db.query('update dossiers set agence_id=$2 where id=$1', [id, agence])
  expect((await mensuel())[0]).toMatchObject({ ouverts: 1, complets: 0 })
})

test('demonstration, echeance et alerte d epuisement ne comptent pas comme relances', async () => {
  const demo = await dossier({ demonstration: true })
  await relance(demo, 'depot')
  const id = await dossier()
  for (const nature of ['echeance', 'epuise']) {
    const r = (
      await db.query<{ id: string }>(
        `insert into rappels_dossiers(cle,dossier_id,agence_id,nature,membre_id,revision_dossier,empreinte_email,expiration_dossier,expire_le)
         values(encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),$1,$2,$3,$4,gen_random_uuid(),repeat('a',64),now()+interval '2 days',now()+interval '1 day')
         returning id`,
        [id, agence, nature, admin],
      )
    ).rows[0]!.id
    await db.query(
      "insert into courriels_sortants(id,contenu,expire_le,rappel_id) values($1,'chiffre-fictif',now()+interval '1 day',$1)",
      [r],
    )
  }
  expect((await mensuel())[0]).toMatchObject({ relances_garant: 0, relances_locataire: 0 })
})

const lectures = [
  'pilotage_de_mon_agence()',
  'dossiers_bloques_de_mon_agence()',
  'pilotage_mensuel_de_mon_agence()',
]
test.each(['anon', 'porteur_lien', 'serveur', 'depot_piece', 'archive_signature', 'service_role'])(
  'le role %s ne lit aucune des trois fonctions',
  async (role) => {
    for (const f of lectures)
      expect(
        (
          await db.query<{ p: boolean }>('select has_function_privilege($1,$2,$3) p', [
            role,
            `public.${f}`,
            'execute',
          ])
        ).rows[0]!.p,
        `${role} ${f}`,
      ).toBe(false)
  },
)

test('la fonction interne ne se laisse pas appeler avec l agence d un autre', async () => {
  await devenir(db, 'authenticated', admin)
  await expect(db.query('select * from blocages_agence($1)', [autreAgence])).rejects.toThrow(
    /permission denied/,
  )
  await db.exec('rollback')
  await db.exec('begin')
})
