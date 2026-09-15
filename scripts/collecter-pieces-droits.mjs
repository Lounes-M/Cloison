import { Client } from 'pg'
import { z } from 'zod'
import { resolve, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { configurationLectureDroits } from './examiner-suivi-droits.mjs'
import {
  verifierSysteme,
  repertoirePrive,
  lireBorne,
  ecrireNeuf,
} from './fichiers-export-prives.mjs'
import { collecterPiecesDroits } from '../lib/droits/pieces.ts'
import { stockagePiecesDroits } from '../lib/droits/stockage-pieces.ts'

export async function ecrirePiecesDroits(decisionPath, destination, collecter) {
  verifierSysteme()
  const sortie = resolve(destination)
  await repertoirePrive(dirname(resolve(decisionPath)))
  await repertoirePrive(dirname(sortie))
  const lire = async () => {
    const b = await lireBorne(decisionPath, 65536),
      s = b.toString('utf8')
    if (!Buffer.from(s).equals(b)) throw new Error()
    return s
  }
  const brut = await lire()
  const r = await collecter(brut)
  let cree = false
  const verifier = async () => {
    if ((await lire()) !== brut) throw new Error()
    await r.verifier()
  }
  try {
    await verifier()
    // Creation exclusive : un repertoire existant n'est jamais modifie ou retire.
    await mkdir(sortie, { mode: 0o700 })
    cree = true
    for (const [nom, b] of r.fichiers) {
      if (!/^piece-[0-9]{4}\.(pdf|png|jpg)$/.test(nom)) throw new Error()
      await verifier()
      await ecrireNeuf(join(sortie, nom), b)
      b.fill(0)
    }
    const manifeste = Buffer.from(JSON.stringify(r.manifeste, null, 2))
    await ecrireNeuf(join(sortie, 'inventaire-prive.json'), manifeste)
    await verifier()
    return { nombre: r.fichiers.size, sha256: createHash('sha256').update(manifeste).digest('hex') }
  } catch (erreur) {
    if (cree) await rm(sortie, { recursive: true, force: true })
    throw erreur
  } finally {
    for (const b of r.fichiers.values()) b.fill(0)
  }
}

const cle = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/)
  .transform((s) => {
    const b = Buffer.from(s, 'base64')
    if (b.length !== 32 || b.toString('base64') !== s) throw new Error()
    return b
  })
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let db, minuterie, configuration
  const blocs = []
  try {
    verifierSysteme()
    if (process.argv.length !== 4 || process.stdin.isTTY) throw new Error()
    const [, , decisionPath, destination] = process.argv
    await repertoirePrive(dirname(resolve(decisionPath)))
    await repertoirePrive(dirname(resolve(destination)))
    minuterie = setTimeout(() => {
      process.stderr.write('Configuration interrompue.\n')
      process.exit(1)
    }, 5000)
    let taille = 0
    for await (const b of process.stdin) {
      taille += b.length
      if (taille > 16384) throw new Error()
      blocs.push(b)
    }
    clearTimeout(minuterie)
    configuration = z
      .strictObject({
        connexion: z.string().max(4096),
        stockage: z.strictObject({ projet: z.string(), jeton: z.string() }),
        trousseau: z.strictObject({
          historique: cle,
          active: cle.nullable(),
          lecture: z.array(cle).max(4),
        }),
      })
      .parse(JSON.parse(Buffer.concat(blocs).toString('utf8')))
    const telecharger = stockagePiecesDroits(configuration.stockage)
    const c = configurationLectureDroits({
      connexion: configuration.connexion,
      selection: { etat: 'tous' },
    })
    db = new Client({
      connectionString: c.connexion,
      connectionTimeoutMillis: 5000,
      query_timeout: 6000,
      statement_timeout: 5000,
      ssl: c.locale ? false : { rejectUnauthorized: true },
    })
    db.on('error', () => {})
    await db.connect()
    const r = await ecrirePiecesDroits(decisionPath, destination, (brut) =>
      collecterPiecesDroits(db, brut, configuration.trousseau, telecharger),
    )
    process.stdout.write(`${JSON.stringify(r)}\n`)
  } catch {
    process.stderr.write(
      'Collecte des pieces refusee. Verifier les fichiers prives, la decision et les acces operateur.\n',
    )
    process.exitCode = 1
  } finally {
    clearTimeout(minuterie)
    for (const b of blocs) b.fill(0)
    if (configuration) {
      configuration.trousseau.historique.fill(0)
      configuration.trousseau.active?.fill(0)
      for (const b of configuration.trousseau.lecture) b.fill(0)
    }
    await db?.end().catch(() => {})
  }
}
