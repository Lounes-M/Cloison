import { createHash, randomUUID, randomBytes } from 'node:crypto'
import { verifierSuiviExport } from './suivi-export-droits.mjs'
import { lireApprobationExport } from './approbation-export-droits.mjs'
import { ouvrirPaquetDroits } from './paquet-droits.mjs'
import { preuveRemise } from '../lib/droits/remise-format.ts'
import { z } from 'zod'

const hash = (b) => createHash('sha256').update(b).digest('hex')
const reprise = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  jeton: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  approbation: z.string().regex(/^[a-f0-9]{64}$/),
  archive: z.string().regex(/^[a-f0-9]{64}$/),
})
export function nouvelleRemise(brut, archive) {
  lireApprobationExport(brut)
  return {
    version: 1,
    id: randomUUID(),
    jeton: randomBytes(32).toString('base64url'),
    approbation: hash(brut),
    archive: hash(archive),
  }
}
async function transaction(db, demande, travail) {
  await db.query('begin')
  try {
    await db.query("set local lock_timeout='3s'")
    await db.query("set local idle_in_transaction_session_timeout='10s'")
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,5353))', [demande])
    const resultat = await travail()
    await db.query('commit')
    return resultat
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
}

/** Le fichier de reprise prive doit exister AVANT cet appel. Aucun envoi au demandeur. */
export async function publierRemise(db, stockage, brut, archive, cle, etat, reverifier) {
  const r = reprise.parse(etat)
  const { decision: d } = lireApprobationExport(brut)
  if (hash(brut) !== r.approbation || hash(archive) !== r.archive)
    throw new Error('Reprise divergente.')
  const fichiers = ouvrirPaquetDroits(archive, cle, d).fichiers
  for (const b of fichiers.values()) b.fill(0)
  const copie = Uint8Array.from(cle)
  let preuve
  try {
    preuve = await preuveRemise(copie, r.id)
  } finally {
    copie.fill(0)
  }
  const valeurs = [
    r.id,
    d.demande,
    d.revision,
    r.approbation,
    hash(r.jeton),
    hash(preuve),
    r.archive,
    archive.length,
    JSON.stringify(d),
    d.expireLe,
  ]
  await reverifier()
  await transaction(db, d.demande, async () => {
    await verifierSuiviExport(db, d, brut)
    await db.query(
      `insert into public.remises_droits(id,demande,revision,approbation_sha256,jeton_sha256,preuve_acces_sha256,archive_sha256,taille,manifeste,expire_le)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) on conflict(id) do nothing`,
      valeurs,
    )
    const { rows } = await db.query(
      `select id from public.remises_droits where id=$1 and demande=$2 and revision=$3 and approbation_sha256=$4 and jeton_sha256=$5 and preuve_acces_sha256=$6 and archive_sha256=$7 and taille=$8 and manifeste=$9::jsonb and expire_le=$10 and revoque_le is null and purge_le is null and expire_le>clock_timestamp()`,
      valeurs,
    )
    if (rows.length !== 1) throw new Error('Remise divergente ou revoquee.')
  })
  // Ecriture immuable ; un rejeu accepte seulement les memes octets distants.
  await stockage(r.id, archive)
  await reverifier()
  await transaction(db, d.demande, async () => {
    await verifierSuiviExport(db, d, brut)
    const { rows } = await db.query(
      `update public.remises_droits set disponible=true where id=$1 and revoque_le is null and purge_le is null and expire_le>clock_timestamp() returning id`,
      [r.id],
    )
    if (rows.length !== 1) throw new Error('Remise indisponible.')
  })
  return { id: r.id, expireLe: d.expireLe }
}

export async function revoquerRemise(db, id) {
  z.uuid().parse(id)
  // Meme ordre de verrouillage que la remise et le suivi administratif.
  const { rows } = await db.query('select demande from public.remises_droits where id=$1', [id])
  if (rows.length !== 1) throw new Error('Remise indisponible.')
  await transaction(db, rows[0].demande, async () => {
    await db.query(
      'update public.remises_droits set revoque_le=coalesce(revoque_le,clock_timestamp()) where id=$1',
      [id],
    )
  })
}

export async function examinerRemise(db, id) {
  z.uuid().parse(id)
  const { rows } = await db.query(
    `select id,expire_le,disponible,revoque_le,premier_acces_le,recu_le,purge_le,acces,archive_sha256 from public.remises_droits where id=$1`,
    [id],
  )
  if (rows.length !== 1) throw new Error('Remise indisponible.')
  return rows[0]
}
