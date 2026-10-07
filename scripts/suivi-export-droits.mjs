import { Client } from 'pg'
import { z } from 'zod'
import { configurationLectureDroits } from './examiner-suivi-droits.mjs'
import { lireApprobationExport } from './approbation-export-droits.mjs'
import { verifierDecisionPaquet } from './paquet-droits.mjs'

/** Lecture fraiche a chaque controle, sans instantane conserve entre les fichiers. */
export async function verifierSuiviExport(db, valeur, approbation) {
  try {
    const d = verifierDecisionPaquet(valeur)
    const a = lireApprobationExport(approbation)
    if (JSON.stringify(d) !== JSON.stringify(a.decision)) throw new Error()
    const { rows } = await db.query(
      `select s.operation from public.suivi_demandes_droits s
       where s.demande=$1 and s.operation=$2 and s.preuve_sha256=$3
       and s.nature=$6 and s.operateur=$7 and s.etat='en_cours'
       and s.effacer_le>clock_timestamp()
       and $4::timestamptz<=s.inscrit_le and $4::timestamptz>=s.inscrit_le-interval '5 minutes'
       and $5::timestamptz>clock_timestamp() and $5::timestamptz<=s.effacer_le
       and $5::timestamptz<=s.inscrit_le+interval '72 hours'
       and not exists(select 1 from public.suivi_demandes_droits n where n.precedente=s.operation)`,
      [d.demande, d.revision, d.decisionSha256, d.creeLe, d.expireLe, a.nature, a.operateur],
    )
    if (rows.length !== 1 || rows[0].operation !== d.revision) throw new Error()
  } catch {
    throw new Error('Decision export indisponible dans le suivi courant.')
  }
}

export async function avecSuiviExport(valeur, executer) {
  const entree = z.strictObject({ connexion: z.string().max(4096) }).parse(valeur)
  const c = configurationLectureDroits({ ...entree, selection: { etat: 'tous' } })
  const db = new Client({
    connectionString: c.connexion,
    connectionTimeoutMillis: 5000,
    query_timeout: 6000,
    statement_timeout: 5000,
    ssl: c.locale ? false : { rejectUnauthorized: true },
  })
  db.on('error', () => {})
  try {
    await db.connect()
    return await executer((decision, approbation) => verifierSuiviExport(db, decision, approbation))
  } finally {
    await db.end().catch(() => {})
  }
}
