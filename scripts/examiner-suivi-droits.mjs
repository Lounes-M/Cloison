import { Client } from 'pg'
import { z } from 'zod'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const filtre = z.union([
  z.strictObject({ demande: z.uuid() }),
  z.strictObject({
    etat: z.enum(['ouverts', 'tous']),
    apres: z
      .strictObject({ echeance: z.iso.datetime({ offset: true }), demande: z.uuid() })
      .nullable()
      .default(null),
  }),
])
export async function examinerSuiviDroits(db, selection) {
  const p = filtre.safeParse(selection)
  if (!p.success) throw new Error('Selection de suivi invalide')
  await db.query('begin isolation level repeatable read read only')
  try {
    await db.query("set local statement_timeout='5s'")
    await db.query("set local lock_timeout='1s'")
    await db.query("set local idle_in_transaction_session_timeout='10s'")
    const observe = (await db.query('select clock_timestamp() observe_le')).rows[0].observe_le
    if ('demande' in p.data) {
      const { rows: actuelle } = await db.query(
        `select operation,effacer_le from public.suivi_demandes_droits s where demande=$1 and effacer_le>clock_timestamp()
    and not exists(select 1 from public.suivi_demandes_droits n where n.precedente=s.operation)`,
        [p.data.demande],
      )
      if (actuelle.length !== 1) throw new Error('Suivi indisponible')
      const { rows } = await db.query(
        `with recursive chaine as (
    select s.*,0 profondeur from public.suivi_demandes_droits s where demande=$1 and precedente is null
    union all select s.*,c.profondeur+1 from public.suivi_demandes_droits s join chaine c on s.precedente=c.operation where c.profondeur<100
   ) select operation,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256,compte_base,inscrit_le from chaine order by profondeur limit 101`,
        [p.data.demande],
      )
      if (!rows.length || rows.length > 100 || rows.at(-1).operation !== actuelle[0].operation)
        throw new Error('Historique de suivi incoherent')
      const verification = await db.query(
        'select effacer_le>clock_timestamp() valable from public.suivi_demandes_droits where operation=$1',
        [actuelle[0].operation],
      )
      if (verification.rows[0]?.valable !== true) throw new Error('Suivi indisponible')
      return { version: 1, observe_le: observe, demande: p.data.demande, etapes: rows }
    }
    const { rows } = await db.query(
      `select demande,operation,nature,etat,recu_le,
   to_char(repondre_avant at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') repondre_avant,effacer_le,
   (repondre_avant<clock_timestamp() and etat not in ('repondu','clos')) en_retard
   from public.suivi_demandes_droits s where effacer_le>clock_timestamp()
   and not exists(select 1 from public.suivi_demandes_droits n where n.precedente=s.operation)
   and ($1='tous' or etat<>'clos') and ($2::timestamptz is null or (repondre_avant,demande)>($2::timestamptz,$3::uuid))
   order by s.repondre_avant,demande limit 51`,
      [p.data.etat, p.data.apres?.echeance ?? null, p.data.apres?.demande ?? null],
    )
    const demandes = rows.slice(0, 50),
      derniere = demandes.at(-1)
    return {
      version: 1,
      observe_le: observe,
      demandes,
      suivant:
        rows.length > 50 ? { echeance: derniere.repondre_avant, demande: derniere.demande } : null,
    }
  } finally {
    await db.query('rollback')
  }
}
export function configurationLectureDroits(valeur) {
  const p = z.strictObject({ connexion: z.string().max(4096), selection: filtre }).safeParse(valeur)
  if (!p.success) throw new Error('Configuration de lecture invalide')
  const adresse = new URL(p.data.connexion)
  if (
    !['postgres:', 'postgresql:'].includes(adresse.protocol) ||
    !adresse.hostname ||
    adresse.search ||
    adresse.hash
  )
    throw new Error('Connexion de lecture invalide')
  return { ...p.data, locale: ['localhost', '127.0.0.1', '[::1]'].includes(adresse.hostname) }
}
export async function lireSuiviDroits(valeur) {
  const c = configurationLectureDroits(valeur),
    db = new Client({
      connectionString: c.connexion,
      connectionTimeoutMillis: 5000,
      query_timeout: 6000,
      ssl: c.locale ? false : { rejectUnauthorized: true },
    })
  db.on('error', () => {})
  try {
    await db.connect()
    return await examinerSuiviDroits(db, c.selection)
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
      if (taille > 8192) throw new Error()
      blocs.push(bloc)
    }
    const resultat = await lireSuiviDroits(JSON.parse(Buffer.concat(blocs).toString('utf8')))
    process.stdout.write(JSON.stringify(resultat, null, 2) + '\n')
  } catch {
    console.error('Lecture de suivi indisponible ; aucune donnee privee journalisee.')
    process.exitCode = 1
  }
}
