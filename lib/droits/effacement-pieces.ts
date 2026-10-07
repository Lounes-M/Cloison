import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { BaseCollecte } from './collecte.ts'

const uuid = z.uuid().transform((v) => v.toLowerCase())
const empreinte = z.string().regex(/^[a-f0-9]{64}$/)
const selection = z.strictObject({
  id: uuid,
  dossier: uuid,
  appartenance: z.literal('demandeur'),
  revueTiers: z.literal('validee'),
  conservation: z.literal('aucune_apres_examen'),
})
const commun = {
  version: z.literal(1),
  nature: z.literal('effacement'),
  demande: uuid,
  revision: uuid,
  operation: uuid,
  operateur: uuid,
  demandeur: z.strictObject({
    email: z.email().max(180),
    identiteSha256: empreinte,
    mandat: z.enum(['non_requis', 'verifie']),
  }),
  expireLe: z.iso.datetime(),
  perimetre: z.literal('pieces_selectionnees_uniquement'),
}
const projet = z.strictObject({ ...commun, pieces: z.array(selection).min(1).max(100) })
const decision = z.strictObject({
  ...commun,
  pieces: z
    .array(
      selection.extend({
        chemin: z.string().min(8).max(512),
        pieceSha256: empreinte,
        dossierSha256: empreinte,
      }),
    )
    .min(1)
    .max(100),
})
const hash = (texte: string) => createHash('sha256').update(texte, 'utf8').digest('hex')
const refuser = (): never => {
  throw new Error('Effacement individuel refuse.')
}
function lire(brut: string, preparation: true): z.infer<typeof projet>
function lire(brut: string, preparation: false): z.infer<typeof decision>
function lire(brut: string, preparation: boolean) {
  if (typeof brut !== 'string' || Buffer.byteLength(brut) > 65536) return refuser()
  const d = (preparation ? projet : decision).parse(JSON.parse(brut))
  if (
    d.operation === d.revision ||
    new Set(d.pieces.map((p) => p.id)).size !== d.pieces.length ||
    new Set(d.pieces.map((p) => p.dossier)).size > 50
  )
    return refuser()
  return d
}
async function transaction<T>(db: BaseCollecte, lecture: boolean, action: () => Promise<T>) {
  try {
    await db.query(lecture ? 'begin isolation level repeatable read read only' : 'begin')
    await db.query("set local statement_timeout='5s'")
    await db.query("set local lock_timeout='1s'")
    await db.query("set local idle_in_transaction_session_timeout='10s'")
    await db.query("set local timezone='UTC'")
    const r = await action()
    await db.query('commit')
    return r
  } catch {
    await db.query('rollback').catch(() => {})
    return refuser()
  }
}
async function photographier(db: BaseCollecte, d: z.infer<typeof projet>, verrouiller: boolean) {
  // Meme ordre que les retraits/depots : dossiers, puis pieces. Aucun verrou de table.
  const dossiers = (
    await db.query(
      `select id,email_garant,to_jsonb(d)::text photographie from public.dossiers d
     where id=any($1::uuid[]) order by id ${verrouiller ? 'for update' : ''}`,
      [[...new Set(d.pieces.map((p) => p.dossier))]],
    )
  ).rows
  const pieces = (
    await db.query(
      `select id,dossier_id,chemin,to_jsonb(p)::text photographie from public.pieces p
     where id=any($1::uuid[]) order by id ${verrouiller ? 'for update' : ''}`,
      [d.pieces.map((p) => p.id)],
    )
  ).rows
  if (pieces.length !== d.pieces.length) return refuser()
  return d.pieces.map((p) => {
    const dossier = dossiers.find((r) => r.id === p.dossier)
    const piece = pieces.find((r) => r.id === p.id)
    if (
      !dossier ||
      !piece ||
      piece.dossier_id !== p.dossier ||
      typeof dossier.email_garant !== 'string' ||
      dossier.email_garant.toLowerCase() !== d.demandeur.email.toLowerCase() ||
      typeof piece.chemin !== 'string' ||
      !piece.chemin.startsWith(`${p.dossier}/`) ||
      typeof piece.photographie !== 'string' ||
      typeof dossier.photographie !== 'string'
    )
      return refuser()
    return {
      ...p,
      chemin: piece.chemin,
      pieceSha256: hash(piece.photographie),
      dossierSha256: hash(dossier.photographie),
    }
  })
}

/** Photographie privee a relire et a approuver ensuite dans le registre, jamais une autorisation. */
export async function preparerEffacementPieces(db: BaseCollecte, brut: string) {
  return transaction(db, true, async () => {
    const d = lire(brut, true)
    if (Date.parse(d.expireLe) <= Date.now()) return refuser()
    // Le registre prive est inaccessible aux roles applicatifs, meme pour la preparation.
    const r = await db.query(
      `select operation from public.suivi_demandes_droits
      where demande=$1 and nature='effacement' and effacer_le>clock_timestamp() limit 1`,
      [d.demande],
    )
    if (r.rows.length !== 1) return refuser()
    return decision.parse({ ...d, pieces: await photographier(db, d, false) })
  })
}

async function bilan(db: BaseCollecte, d: z.infer<typeof decision>, reprise: boolean) {
  const chemins = d.pieces.map((p) => p.chemin)
  const { rows } = await db.query(
    `select
    exists(select 1 from public.pieces where id=any($1::uuid[]) or chemin=any($2::text[])) encore_inscrite,
    (select count(*)::int from public.objets_a_supprimer where chemin=any($2::text[])) en_file,
    (select count(*)::int from storage.objects where bucket_id='pieces' and name=any($2::text[])) objets_signales`,
    [d.pieces.map((p) => p.id), chemins],
  )
  const r = rows[0]
  if (
    rows.length !== 1 ||
    r?.encore_inscrite !== false ||
    !Number.isInteger(r.en_file) ||
    !Number.isInteger(r.objets_signales)
  )
    return refuser()
  return {
    version: 1,
    operation: d.operation,
    reprise,
    piecesRetirees: d.pieces.length,
    suppressionsEnFile: r.en_file as number,
    objetsSignalesParStorage: r.objets_signales as number,
    effacementComplet: false,
    verificationRestante: [
      'stockage_physique_et_caches',
      'copies_reutilisees',
      'exports_et_copies_de_travail',
      'sauvegardes_et_rejeu_apres_restauration',
      'prestataires',
      'autres_donnees_du_demandeur',
    ],
  }
}

/** Retrait transactionnel sous compte prive. Ne supprime ni acte, ni compte, ni cle de coffre. */
export async function effacerPiecesIndividuelles(db: BaseCollecte, brut: string) {
  return transaction(db, false, async () => {
    const d = lire(brut, false),
      preuve = hash(brut)
    if (
      d.pieces.some((p) => !p.chemin.startsWith(`${p.dossier}/`)) ||
      new Set(d.pieces.map((p) => p.chemin)).size !== d.pieces.length
    )
      return refuser()
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,5353))', [d.demande])
    const trace = hash(`cloison-effacement-pieces-v1:${preuve}`)
    const deja = (
      await db.query(
        `select operation from public.suivi_demandes_droits
      where operation=$1 and demande=$2 and precedente=$3 and operateur=$4
      and nature='effacement' and etat='en_cours' and preuve_sha256=$5
      and compte_base=session_user and effacer_le>clock_timestamp()`,
        [d.operation, d.demande, d.revision, d.operateur, trace],
      )
    ).rows
    // Une reponse COMMIT perdue se reprend sans nouvelle suppression, meme apres expiration.
    if (deja.length === 1) return bilan(db, d, true)
    const verifier = async () => {
      const r = await db.query(
        `select operation from public.suivi_demandes_droits s
        where operation=$1 and demande=$2 and operateur=$3 and nature='effacement'
        and etat='en_cours' and preuve_sha256=$4 and effacer_le>clock_timestamp()
        and $5::timestamptz>clock_timestamp() and $5::timestamptz<=effacer_le
        and $5::timestamptz<=inscrit_le+interval '72 hours'
        and not exists(select 1 from public.suivi_demandes_droits n where n.precedente=s.operation)`,
        [d.revision, d.demande, d.operateur, preuve, d.expireLe],
      )
      if (r.rows.length !== 1) return refuser()
    }
    await verifier()
    const maintenant = await photographier(db, d, true)
    if (
      maintenant.some(
        (p, i) =>
          p.chemin !== d.pieces[i]!.chemin ||
          p.pieceSha256 !== d.pieces[i]!.pieceSha256 ||
          p.dossierSha256 !== d.pieces[i]!.dossierSha256,
      )
    )
      return refuser()
    await verifier()
    const suppression = await db.query(
      'delete from public.pieces where id=any($1::uuid[]) returning id',
      [d.pieces.map((p) => p.id)],
    )
    if (suppression.rows.length !== d.pieces.length) return refuser()
    // Les triggers existants inscrivent les chemins abandonnes et la file Storage dans cette transaction.
    const file = (
      await db.query(`select chemin from public.objets_a_supprimer where chemin=any($1::text[])`, [
        d.pieces.map((p) => p.chemin),
      ])
    ).rows
    if (file.length !== d.pieces.length) return refuser()
    await verifier()
    const inscription = await db.query(
      `insert into public.suivi_demandes_droits
      (operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
      select $1,demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,$2
      from public.suivi_demandes_droits where operation=$3 returning operation`,
      [d.operation, trace, d.revision],
    )
    if (inscription.rows.length !== 1) return refuser()
    return bilan(db, d, false)
  })
}
