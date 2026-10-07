import { Client } from 'pg'
import { fstatSync, readSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { configurationLectureDroits } from './examiner-suivi-droits.mjs'
import {
  verifierSysteme,
  repertoirePrive,
  lireBorne,
  ecrireNeuf,
} from './fichiers-export-prives.mjs'
import { nouvelleRemise, publierRemise, revoquerRemise, examinerRemise } from './remise-droits.mjs'
import { stockageRemise } from './stockage-remise-droits.mjs'

/** Configuration par stdin et cle binaire sur fd 3 ; aucune cle dans argv ou stdout. */
export async function executerRemise(commande, argumentsPrives, configuration, cle) {
  verifierSysteme()
  const c = z
    .strictObject({ connexion: z.string().max(4096), stockage: z.unknown().optional() })
    .parse(configuration)
  const connexion = configurationLectureDroits({
    connexion: c.connexion,
    selection: { etat: 'tous' },
  })
  const db = new Client({
    connectionString: c.connexion,
    connectionTimeoutMillis: 5000,
    query_timeout: 8000,
    statement_timeout: 6000,
    ssl: connexion.locale ? false : { rejectUnauthorized: true },
  })
  db.on('error', () => {})
  try {
    await db.connect()
    if (commande === 'revoquer' && argumentsPrives.length === 1) {
      await revoquerRemise(db, argumentsPrives[0])
      return { revoquee: true }
    }
    if (commande === 'examiner' && argumentsPrives.length === 2) {
      const [id, destination] = argumentsPrives
      await repertoirePrive(dirname(resolve(destination)))
      const resultat = await examinerRemise(db, id)
      await ecrireNeuf(destination, Buffer.from(JSON.stringify(resultat)))
      return { rapport: true }
    }
    if (
      commande !== 'publier' ||
      argumentsPrives.length !== 3 ||
      !Buffer.isBuffer(cle) ||
      cle.length !== 32
    )
      throw new Error()
    const [approbation, paquet, reprise] = argumentsPrives
    const brutOctets = await lireBorne(approbation, 256 * 1024)
    let brut
    try {
      brut = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(brutOctets)
    } finally {
      brutOctets.fill(0)
    }
    const archive = await lireBorne(paquet, 90 * 1024 * 1024)
    try {
      await repertoirePrive(dirname(resolve(reprise)))
      // Ecriture exclusive avant toute mutation distante. Un fichier existant est relu.
      try {
        await ecrireNeuf(reprise, Buffer.from(JSON.stringify(nouvelleRemise(brut, archive))))
      } catch (e) {
        if (e?.code !== 'EEXIST') throw e
      }
      const octets = await lireBorne(reprise, 2048)
      let etat
      try {
        etat = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets))
      } finally {
        octets.fill(0)
      }
      const reverifier = async () => {
        const actuel = await lireBorne(approbation, 256 * 1024)
        try {
          if (!actuel.equals(Buffer.from(brut))) throw new Error()
        } finally {
          actuel.fill(0)
        }
      }
      await publierRemise(db, stockageRemise(c.stockage), brut, archive, cle, etat, reverifier)
      return { disponible: true }
    } finally {
      archive.fill(0)
    }
  } finally {
    await db.end().catch(() => {})
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let cle
  try {
    verifierSysteme()
    const [commande, ...args] = process.argv.slice(2)
    let brut = ''
    for await (const bloc of process.stdin) {
      brut += bloc.toString('utf8')
      if (Buffer.byteLength(brut) > 16384) throw new Error()
    }
    if (commande === 'publier') {
      const stat = fstatSync(3)
      if (!stat.isFile() || stat.size !== 32 || (stat.mode & 0o077) !== 0) throw new Error()
      cle = Buffer.alloc(32)
      if (readSync(3, cle, 0, 32, 0) !== 32) throw new Error()
    }
    console.log(JSON.stringify(await executerRemise(commande, args, JSON.parse(brut), cle)))
  } catch {
    console.error('Remise de droits refusee.')
    process.exitCode = 1
  } finally {
    cle?.fill(0)
  }
}
