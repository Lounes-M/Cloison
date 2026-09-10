import { createHash } from 'node:crypto'
import { Client } from 'pg'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const invalide = () => new Error('Decision administrative invalide')
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
export function configurationDecision(valeur) {
  if (
    !valeur ||
    Object.keys(valeur).sort().join(',') !== 'connexion,decision,operateur,operation,rapport'
  )
    throw invalide()
  if (
    typeof valeur.operation !== 'string' ||
    typeof valeur.operateur !== 'string' ||
    !uuid.test(valeur.operation) ||
    !uuid.test(valeur.operateur) ||
    !['a_examiner', 'a_corriger', 'justifie', 'corrige'].includes(valeur.decision) ||
    typeof valeur.connexion !== 'string'
  )
    throw invalide()
  const rapport = valeur.rapport
  if (
    !rapport ||
    Object.keys(rapport).sort().join(',') !== 'contenu,format,sha256' ||
    rapport.format !== 'cloison-diagnostic-paiement-v1' ||
    typeof rapport.contenu !== 'string' ||
    Buffer.byteLength(rapport.contenu) > 4 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(rapport.sha256) ||
    createHash('sha256').update(rapport.contenu).digest('hex') !== rapport.sha256
  )
    throw invalide()
  const diagnostic = JSON.parse(rapport.contenu)
  if (
    diagnostic?.version !== 1 ||
    typeof diagnostic.reference_session !== 'string' ||
    !/^cs_[A-Za-z0-9_]{1,196}$/.test(diagnostic.reference_session) ||
    typeof diagnostic.observe_le !== 'string'
  )
    throw invalide()
  const observe = new Date(diagnostic.observe_le)
  if (
    !Number.isFinite(observe.getTime()) ||
    observe.getTime() < 0 ||
    observe.getTime() > Date.now() + 300000
  )
    throw invalide()
  const adresse = new URL(valeur.connexion)
  if (
    !['postgres:', 'postgresql:'].includes(adresse.protocol) ||
    !adresse.hostname ||
    adresse.search ||
    adresse.hash
  )
    throw invalide()
  return {
    connexion: valeur.connexion,
    locale: ['localhost', '127.0.0.1', '[::1]'].includes(adresse.hostname),
    operation: valeur.operation.toLowerCase(),
    operateur: valeur.operateur.toLowerCase(),
    decision: valeur.decision,
    reference: diagnostic.reference_session,
    empreinte: rapport.sha256,
    observeLe: observe.toISOString(),
  }
}

export async function consignerDecision(db, configuration) {
  const c = configurationDecision(configuration)
  await db.query('begin')
  try {
    await db.query("set local statement_timeout='5s'")
    await db.query("set local lock_timeout='1s'")
    await db.query("set local idle_in_transaction_session_timeout='10s'")
    const insertion = await db.query(
      `insert into public.decisions_paiements
      (operation,operateur,reference_session,decision,rapport_sha256,rapport_observe_le)
      values ($1,$2,$3,$4,$5,$6) on conflict(operation) do nothing returning operation`,
      [c.operation, c.operateur, c.reference, c.decision, c.empreinte, c.observeLe],
    )
    const { rows } = await db.query(
      `select operateur,reference_session,decision,rapport_sha256,rapport_observe_le,
      compte_base,session_user as compte_courant from public.decisions_paiements where operation=$1`,
      [c.operation],
    )
    const ligne = rows[0]
    if (
      rows.length !== 1 ||
      ligne.operateur !== c.operateur ||
      ligne.reference_session !== c.reference ||
      ligne.decision !== c.decision ||
      ligne.rapport_sha256 !== c.empreinte ||
      new Date(ligne.rapport_observe_le).toISOString() !== c.observeLe ||
      ligne.compte_base !== ligne.compte_courant
    )
      throw invalide()
    await db.query('commit')
    return { cree: insertion.rows.length === 1 }
  } catch {
    await db.query('rollback').catch(() => {})
    throw new Error('Decision non enregistree')
  }
}

export async function enregistrerDecision(configuration) {
  const c = configurationDecision(configuration)
  const db = new Client({
    connectionString: c.connexion,
    connectionTimeoutMillis: 5000,
    query_timeout: 6000,
    ssl: c.locale ? false : { rejectUnauthorized: true },
  })
  db.on('error', () => {})
  try {
    await db.connect()
    return await consignerDecision(db, configuration)
  } finally {
    await db.end().catch(() => {})
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2 || process.stdin.isTTY) throw invalide()
    const blocs = []
    let taille = 0
    for await (const bloc of process.stdin) {
      taille += bloc.length
      if (taille > 8 * 1024 * 1024) throw invalide()
      blocs.push(bloc)
    }
    await enregistrerDecision(JSON.parse(Buffer.concat(blocs).toString('utf8')))
    console.log('Decision consignée ; aucune alerte financiere acquittee.')
  } catch {
    console.error('Decision indisponible ; aucune donnee financiere journalisee.')
    process.exitCode = 1
  }
}
