import { createHash } from 'node:crypto'
import { z } from 'zod'

const uuid = z.uuid().transform((v) => v.toLowerCase())
const schema = z
  .strictObject({
    version: z.literal(1),
    demande: uuid,
    revision: uuid,
    operateur: uuid,
    nature: z.enum(['acces', 'portabilite']),
    destinataire: z.strictObject({
      reference: uuid,
      email: z.email().max(180),
      identiteSha256: z.string().regex(/^[a-f0-9]{64}$/),
      mandat: z.enum(['non_requis', 'verifie']),
    }),
    expireLe: z.iso.datetime(),
    pieces: z
      .array(z.strictObject({ id: uuid, dossier: uuid }))
      .min(1)
      .max(100)
      .optional(),
    dossiers: z
      .array(z.strictObject({ id: uuid, partie: z.enum(['locataire', 'garant']) }))
      .min(1)
      .max(50),
  })
  .superRefine((d, ctx) => {
    if (
      d.pieces &&
      (new Set(d.pieces.map((p) => p.id)).size !== d.pieces.length ||
        d.pieces.some((p) => !d.dossiers.some((s) => s.id === p.dossier && s.partie === 'garant')))
    )
      ctx.addIssue({ code: 'custom', message: 'Pieces hors selection.' })
    if (new Set(d.dossiers.map((s) => `${s.id}/${s.partie}`)).size !== d.dossiers.length)
      ctx.addIssue({ code: 'custom', message: 'Selection dupliquee.' })
  })

export type BaseCollecte = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}
const refuser = (): never => {
  throw new Error('Collecte individuelle refusee.')
}

/** L'empreinte porte sur les octets UTF-8 exacts approuves, y compris leur mise en forme. */
export function decisionCollecte(brut: string) {
  try {
    if (typeof brut !== 'string' || Buffer.byteLength(brut) > 65536) return refuser()
    const d = schema.parse(JSON.parse(brut))
    if (Date.parse(d.expireLe) <= Date.now()) return refuser()
    return { decision: d, empreinte: createHash('sha256').update(brut, 'utf8').digest('hex') }
  } catch {
    return refuser()
  }
}

/** Controle ponctuel de la derniere decision. Ne constitue pas une reservation de remise. */
export async function verifierSuiviCollecte(db: BaseCollecte, brut: string) {
  try {
    const { decision: d, empreinte } = decisionCollecte(brut)
    const r = await db.query(
      `select operation from public.suivi_demandes_droits s
    where s.demande=$1 and s.operation=$2 and s.operateur=$3 and s.nature=$4
    and s.etat='en_cours' and s.preuve_sha256=$5
    and s.effacer_le>clock_timestamp() and $6::timestamptz>clock_timestamp()
    and $6::timestamptz<=s.effacer_le and $6::timestamptz<=s.inscrit_le+interval '72 hours'
    and not exists(select 1 from public.suivi_demandes_droits n where n.precedente=s.operation)`,
      [d.demande, d.revision, d.operateur, d.nature, empreinte, d.expireLe],
    )
    if (r.rows.length !== 1 || r.rows[0]?.operation !== d.revision) refuser()
  } catch {
    return refuser()
  }
}

const texte = z.string().nullable()
const instant = z.iso.datetime({ offset: true })
const cents = z
  .string()
  .regex(/^\d{1,20}$/)
  .nullable()
const piece = z.strictObject({
  id: uuid,
  type: z.string().max(50),
  taille_octets: z.number().int().positive(),
  depose_le: instant,
  nombre_documents: z.number().int().positive(),
})
const ligne = z.strictObject({
  id: uuid,
  partie: z.enum(['locataire', 'garant']),
  reference: z.string().max(32),
  email: z.email().max(180),
  nom_locataire: texte,
  statut: z.string().max(30),
  cree_le: instant,
  expire_le: instant,
  coffre_purge_le: instant.nullable(),
  loyer_cents: cents,
  engagement: z
    .strictObject({
      nom: texte,
      prenom: texte,
      adresse: texte,
      mention: texte,
      mention_saisie_le: instant.nullable(),
      couvre: z.string(),
      montant_max_cents: cents,
      jusqu_au: z.iso.date().nullable(),
      solidaire: z.boolean(),
      revenu_net_mensuel_cents: cents,
      ratio: texte,
      calcule_le: instant.nullable(),
      profil_ressources: z.string(),
      version_conditions: z.number().int(),
    })
    .nullable(),
  pieces: z.array(piece).max(20),
})

/** Collecte SQL de travail uniquement : ni secrets, ni documents Storage, ni remise. */
export async function collecterDonneesDroits(db: BaseCollecte, brut: string) {
  const { decision: d, empreinte } = decisionCollecte(brut)
  let resultat
  try {
    await db.query('begin isolation level repeatable read read only')
    try {
      await db.query("set local statement_timeout='5s'")
      await db.query("set local lock_timeout='1s'")
      await db.query("set local idle_in_transaction_session_timeout='10s'")
      await verifierSuiviCollecte(db, brut)
      const observe = (
        await db.query(
          'select to_char(clock_timestamp() at time zone \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') observe_le',
        )
      ).rows[0]?.observe_le
      if (!instant.safeParse(observe).success) return refuser()
      const { rows } = await db.query(
        `with selection as (
        select * from unnest($1::uuid[],$2::text[]) with ordinality as s(id,partie,ordre)
      ) select d.id,s.partie,d.reference,
        case when s.partie='locataire' then d.email_locataire else d.email_garant end email,
        case when s.partie='locataire' then d.locataire_nom else null end nom_locataire,
        d.statut,d.cree_le::text,d.expire_le::text,d.coffre_purge_le::text,d.loyer_cents::text,
        case when e.dossier_id is not null then jsonb_build_object(
          'nom',e.nom,'prenom',e.prenom,'adresse',e.adresse,'mention',e.mention,
          'mention_saisie_le',e.mention_saisie_le,'couvre',e.couvre,
          'montant_max_cents',e.montant_max_cents::text,'jusqu_au',e.jusqu_au,
          'solidaire',e.solidaire,'revenu_net_mensuel_cents',e.revenu_net_mensuel_cents::text,
          'ratio',case when $4='acces' then e.ratio::text else null end,
          'calcule_le',case when $4='acces' then e.calcule_le else null end,
          'profil_ressources',e.profil_ressources,'version_conditions',e.version_conditions
        ) else null end engagement,
        coalesce((select jsonb_agg(p.objet order by p.id) from (
          select p.id,jsonb_build_object('id',p.id,'type',p.type,'taille_octets',p.taille_octets,
            'depose_le',p.depose_le,'nombre_documents',p.nombre_documents) objet
          from public.pieces p where p.dossier_id=d.id and s.partie='garant'
          order by p.id limit 21
        ) p),'[]'::jsonb) pieces
        from selection s join public.dossiers d on d.id=s.id
        left join public.engagements e on e.dossier_id=d.id and s.partie='garant'
        where lower(case when s.partie='locataire' then d.email_locataire else d.email_garant end)=lower($3)
        order by s.ordre`,
        [
          d.dossiers.map((s) => s.id),
          d.dossiers.map((s) => s.partie),
          d.destinataire.email,
          d.nature,
        ],
      )
      if (rows.length !== d.dossiers.length) return refuser()
      // Les dates de colonnes SQL sont normalisees sans arrondir les montants bigint.
      const dossiers = rows.map((r, i) => {
        const dates = Object.fromEntries(
          ['cree_le', 'expire_le', 'coffre_purge_le'].map((k) => [
            k,
            r[k] === null ? null : new Date(String(r[k])).toISOString(),
          ]),
        )
        const l = ligne.parse({ ...r, ...dates })
        const attendu = d.dossiers[i]!
        if (
          l.id !== attendu.id ||
          l.partie !== attendu.partie ||
          l.email.toLowerCase() !== d.destinataire.email.toLowerCase()
        )
          return refuser()
        if (l.partie === 'locataire' && (l.engagement !== null || l.pieces.length !== 0))
          return refuser()
        if (l.partie === 'garant' && l.nom_locataire !== null) return refuser()
        return l
      })
      resultat = {
        version: 1,
        usage: 'copie_de_travail_a_relire',
        remiseAutorisee: false,
        inventaireComplet: false,
        demande: d.demande,
        revision: d.revision,
        decisionSha256: empreinte,
        observeLe: observe,
        expireLe: d.expireLe,
        destinataireReference: d.destinataire.reference,
        nature: d.nature,
        dossiers,
        exclusionsTechniques:
          d.nature === 'portabilite' ? ['ratio_calcule', 'date_calcul_ratio'] : [],
        sourcesNonCouvertes: [
          'contenu_pieces_storage',
          'brouillons_chiffres',
          'actes_signes',
          'comptes_agence_auth',
          'paiements_et_prestataires',
          'correspondances',
          'journaux',
          'autres_dossiers_non_selectionnes',
        ],
      }
      if (Buffer.byteLength(JSON.stringify(resultat)) > 4 * 1024 * 1024) return refuser()
    } finally {
      await db.query('rollback')
    }
    // Nouvelle lecture hors instantane : un changement de decision pendant la collecte refuse la sortie.
    await verifierSuiviCollecte(db, brut)
    return resultat
  } catch {
    return refuser()
  }
}
