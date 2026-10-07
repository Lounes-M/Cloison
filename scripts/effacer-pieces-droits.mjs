import { Client } from 'pg'
import { z } from 'zod'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { configurationLectureDroits } from './examiner-suivi-droits.mjs'
import {
  verifierSysteme,
  repertoirePrive,
  lireBorne,
  ecrireNeuf,
} from './fichiers-export-prives.mjs'
import {
  preparerEffacementPieces,
  effacerPiecesIndividuelles,
} from '../lib/droits/effacement-pieces.ts'

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let db, minuterie, octets, configuration
  const blocs = []
  try {
    verifierSysteme()
    const [, , mode, source, destination] = process.argv
    if (
      process.stdin.isTTY ||
      !['preparer', 'executer'].includes(mode) ||
      process.argv.length !== (mode === 'preparer' ? 5 : 4)
    )
      throw new Error()
    await repertoirePrive(dirname(resolve(source)))
    if (destination) await repertoirePrive(dirname(resolve(destination)))
    octets = await lireBorne(source, 65536)
    const brut = octets.toString('utf8')
    if (!Buffer.from(brut, 'utf8').equals(octets)) throw new Error()
    minuterie = setTimeout(() => {
      process.stderr.write('Lecture de configuration interrompue.\n')
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
    minuterie = setTimeout(() => {
      process.stderr.write(
        'Traitement interrompu. Reprendre avec la meme decision pour verifier son resultat.\n',
      )
      process.exit(1)
    }, 45000)
    db = new Client({
      connectionString: c.connexion,
      connectionTimeoutMillis: 5000,
      query_timeout: 6000,
      statement_timeout: 5000,
      ssl: c.locale ? false : { rejectUnauthorized: true },
    })
    db.on('error', () => {})
    await db.connect()
    if (mode === 'preparer') {
      const resultat = Buffer.from(
        JSON.stringify(await preparerEffacementPieces(db, brut), null, 2),
        'utf8',
      )
      try {
        if (resultat.length > 65536) throw new Error()
        await ecrireNeuf(destination, resultat)
        process.stdout.write(
          `${JSON.stringify({ taille: resultat.length, sha256: createHash('sha256').update(resultat).digest('hex') })}\n`,
        )
      } finally {
        resultat.fill(0)
      }
    } else {
      const r = await effacerPiecesIndividuelles(db, brut)
      // Pas de chemin, adresse, reference ni identifiant sur la sortie standard.
      const { operation: _operation, ...bilan } = r
      process.stdout.write(`${JSON.stringify(bilan)}\n`)
    }
  } catch {
    process.stderr.write(
      'Effacement individuel refuse ou resultat non confirme. Conserver la decision privee et reprendre avec les memes identifiants.\n',
    )
    process.exitCode = 1
  } finally {
    clearTimeout(minuterie)
    octets?.fill(0)
    configuration?.fill(0)
    for (const bloc of blocs) bloc.fill(0)
    await db?.end().catch(() => {})
  }
}
