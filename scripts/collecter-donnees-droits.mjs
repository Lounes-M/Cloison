import { Client } from 'pg'
import { z } from 'zod'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { configurationLectureDroits } from './examiner-suivi-droits.mjs'
import { collecterDonneesDroits, verifierSuiviCollecte } from '../lib/droits/collecte.ts'
import {
  verifierSysteme,
  repertoirePrive,
  lireBorne,
  ecrireNeuf,
} from './fichiers-export-prives.mjs'

export async function ecrireCollecteDroits(decisionPath, destination, collecter, verifier) {
  verifierSysteme()
  await repertoirePrive(dirname(resolve(decisionPath)))
  await repertoirePrive(dirname(resolve(destination)))
  const lireDecision = async () => {
    const octets = await lireBorne(decisionPath, 65536)
    const texte = octets.toString('utf8')
    if (!Buffer.from(texte, 'utf8').equals(octets)) throw new Error()
    return texte
  }
  const brut = await lireDecision()
  const reverifier = async () => {
    if ((await lireDecision()) !== brut) throw new Error()
    await verifier(brut)
  }
  const resultat = await collecter(brut)
  const octets = Buffer.from(JSON.stringify(resultat, null, 2), 'utf8')
  try {
    if (octets.length > 4 * 1024 * 1024) throw new Error()
    await reverifier()
    await ecrireNeuf(destination, octets)
    try {
      await reverifier()
    } catch (erreur) {
      await rm(destination, { force: true })
      throw erreur
    }
    return { taille: octets.length, sha256: createHash('sha256').update(octets).digest('hex') }
  } finally {
    octets.fill(0)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let db
  let minuterie
  try {
    verifierSysteme()
    if (process.argv.length !== 4 || process.stdin.isTTY) throw new Error()
    const [, , decisionPath, destination] = process.argv
    // Refus du poste ou des repertoires avant lecture des authentifiants.
    await repertoirePrive(dirname(resolve(decisionPath)))
    await repertoirePrive(dirname(resolve(destination)))
    minuterie = setTimeout(() => {
      process.stderr.write('Lecture de configuration interrompue.\n')
      process.exit(1)
    }, 5000)
    const blocs = []
    let taille = 0
    for await (const bloc of process.stdin) {
      taille += bloc.length
      if (taille > 8192) throw new Error()
      blocs.push(bloc)
    }
    clearTimeout(minuterie)
    const entree = z
      .strictObject({ connexion: z.string().max(4096) })
      .parse(JSON.parse(Buffer.concat(blocs).toString('utf8')))
    for (const bloc of blocs) bloc.fill(0)
    const c = configurationLectureDroits({ ...entree, selection: { etat: 'tous' } })
    db = new Client({
      connectionString: c.connexion,
      connectionTimeoutMillis: 5000,
      query_timeout: 6000,
      statement_timeout: 5000,
      ssl: c.locale ? false : { rejectUnauthorized: true },
    })
    db.on('error', () => {})
    await db.connect()
    const resultat = await ecrireCollecteDroits(
      decisionPath,
      destination,
      (brut) => collecterDonneesDroits(db, brut),
      (brut) => verifierSuiviCollecte(db, brut),
    )
    process.stdout.write(`${JSON.stringify(resultat)}\n`)
  } catch {
    process.stderr.write(
      'Collecte individuelle refusee. Verifier la decision, le suivi et les fichiers prives sur un systeme POSIX qualifie.\n',
    )
    process.exitCode = 1
  } finally {
    clearTimeout(minuterie)
    await db?.end().catch(() => {})
  }
}
