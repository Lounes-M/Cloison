import { createHash } from 'node:crypto'
import { Client } from 'pg'
import { z } from 'zod'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const date = z.iso.datetime({ offset: true })
const entree = z.strictObject({
  connexion: z.string().max(4096),
  operation: z.uuid(),
  demande: z.uuid(),
  precedente: z.uuid().nullable(),
  operateur: z.uuid(),
  nature: z.enum([
    'acces',
    'rectification',
    'effacement',
    'opposition',
    'limitation',
    'portabilite',
  ]),
  etat: z.enum(['recue', 'identite_a_verifier', 'en_cours', 'repondu', 'clos']),
  recuLe: date,
  repondreAvant: date,
  effacerLe: date,
  preuve: z.string().min(1).max(262144),
})
export function configurationSuiviDroits(valeur) {
  const p = entree.safeParse(valeur)
  if (!p.success) throw new Error('Configuration de suivi invalide')
  const v = p.data,
    adresse = new URL(v.connexion)
  if (
    !['postgres:', 'postgresql:'].includes(adresse.protocol) ||
    !adresse.hostname ||
    adresse.search ||
    adresse.hash
  )
    throw new Error('Connexion de suivi invalide')
  const recu = new Date(v.recuLe),
    reponse = new Date(v.repondreAvant),
    effacement = new Date(v.effacerLe)
  if (
    recu.getTime() < 0 ||
    recu.getTime() > Date.now() + 300000 ||
    reponse < recu ||
    effacement < reponse ||
    effacement.getTime() <= Date.now()
  )
    throw new Error('Dates de suivi invalides')
  return {
    connexion: v.connexion,
    locale: ['localhost', '127.0.0.1', '[::1]'].includes(adresse.hostname),
    operation: v.operation.toLowerCase(),
    demande: v.demande.toLowerCase(),
    precedente: v.precedente?.toLowerCase() ?? null,
    operateur: v.operateur.toLowerCase(),
    nature: v.nature,
    etat: v.etat,
    recuLe: recu.toISOString(),
    repondreAvant: reponse.toISOString(),
    effacerLe: effacement.toISOString(),
    empreinte: createHash('sha256').update(v.preuve).digest('hex'),
  }
}
export async function consignerSuiviDroits(db, valeur) {
  const c = configurationSuiviDroits(valeur)
  await db.query('begin')
  try {
    await db.query("set local statement_timeout='5s'")
    await db.query("set local lock_timeout='1s'")
    await db.query("set local idle_in_transaction_session_timeout='10s'")
    const insertion = await db.query(
      `insert into public.suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(operation) do nothing returning operation`,
      [
        c.operation,
        c.demande,
        c.precedente,
        c.operateur,
        c.nature,
        c.etat,
        c.recuLe,
        c.repondreAvant,
        c.effacerLe,
        c.empreinte,
      ],
    )
    const { rows } = await db.query(
      'select *,session_user as compte_courant from public.suivi_demandes_droits where operation=$1',
      [c.operation],
    )
    const r = rows[0]
    if (
      rows.length !== 1 ||
      r.demande !== c.demande ||
      r.precedente !== c.precedente ||
      r.operateur !== c.operateur ||
      r.nature !== c.nature ||
      r.etat !== c.etat ||
      r.preuve_sha256 !== c.empreinte ||
      new Date(r.recu_le).toISOString() !== c.recuLe ||
      new Date(r.repondre_avant).toISOString() !== c.repondreAvant ||
      new Date(r.effacer_le).toISOString() !== c.effacerLe ||
      r.compte_base !== r.compte_courant
    )
      throw new Error('Confirmation de suivi invalide')
    await db.query('commit')
    return { cree: insertion.rows.length === 1 }
  } catch {
    await db.query('rollback').catch(() => {})
    throw new Error('Etape non enregistree')
  }
}
export async function enregistrerSuiviDroits(valeur) {
  const c = configurationSuiviDroits(valeur)
  const db = new Client({
    connectionString: c.connexion,
    connectionTimeoutMillis: 5000,
    query_timeout: 6000,
    ssl: c.locale ? false : { rejectUnauthorized: true },
  })
  db.on('error', () => {})
  try {
    await db.connect()
    return await consignerSuiviDroits(db, valeur)
  } finally {
    await db.end().catch(() => {})
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2 || process.stdin.isTTY) throw new Error()
    const blocs = []
    let taille = 0
    for await (const bloc of process.stdin) {
      taille += bloc.length
      if (taille > 1024 * 1024) throw new Error()
      blocs.push(bloc)
    }
    await enregistrerSuiviDroits(JSON.parse(Buffer.concat(blocs).toString('utf8')))
    console.log('Etape de suivi consignée.')
  } catch {
    console.error('Suivi indisponible ; aucune donnee privee journalisee.')
    process.exitCode = 1
  }
}
