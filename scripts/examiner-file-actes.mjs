import { Client } from 'pg'
import { z } from 'zod'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { examinerFileActes } from '../lib/exploitation/file-actes.ts'
import { configurationLectureDroits } from './examiner-suivi-droits.mjs'
import { verifierSysteme, repertoirePrive, ecrireNeuf } from './fichiers-export-prives.mjs'

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let db, minuterie, configuration, rapport
  const blocs = []
  try {
    verifierSysteme()
    if (process.argv.length !== 4 || process.stdin.isTTY) throw new Error()
    const [, , environnement, destination] = process.argv
    z.enum(['sandbox', 'production']).parse(environnement)
    await repertoirePrive(dirname(resolve(destination)))
    minuterie = setTimeout(() => {
      process.stderr.write('Lecture interrompue.\n')
      process.exit(1)
    }, 5000)
    let taille = 0
    for await (const bloc of process.stdin) {
      taille += bloc.length
      if (taille > 8192) throw new Error()
      blocs.push(bloc)
    }
    clearTimeout(minuterie)
    configuration = Buffer.concat(blocs)
    const entree = z
      .strictObject({ connexion: z.string().max(4096) })
      .parse(JSON.parse(configuration.toString('utf8')))
    const c = configurationLectureDroits({ ...entree, selection: { etat: 'tous' } })
    configuration.fill(0)
    for (const bloc of blocs) bloc.fill(0)
    db = new Client({
      connectionString: c.connexion,
      connectionTimeoutMillis: 5000,
      query_timeout: 6000,
      statement_timeout: 5000,
      ssl: c.locale ? false : { rejectUnauthorized: true },
    })
    db.on('error', () => {})
    await db.connect()
    rapport = Buffer.from(
      JSON.stringify(await examinerFileActes(db, environnement), null, 2),
      'utf8',
    )
    await ecrireNeuf(destination, rapport)
    process.stdout.write(
      `${JSON.stringify({ taille: rapport.length, sha256: createHash('sha256').update(rapport).digest('hex') })}\n`,
    )
  } catch {
    process.stderr.write('Diagnostic de la file des actes indisponible.\n')
    process.exitCode = 1
  } finally {
    clearTimeout(minuterie)
    configuration?.fill(0)
    rapport?.fill(0)
    for (const bloc of blocs) bloc.fill(0)
    await db?.end().catch(() => {})
  }
}
