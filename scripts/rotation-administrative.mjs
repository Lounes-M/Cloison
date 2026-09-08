import { Client } from 'pg'
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { rescellerEnveloppes } from './resceller-enveloppes.mjs'

// Configuration privee par stdin uniquement ; aucune cle dans les arguments ou fichiers produits.
async function configuration() {
  if (process.stdin.isTTY) throw new Error('Entree privee obligatoire')
  const morceaux = []
  let taille = 0
  for await (const morceau of process.stdin) {
    taille += morceau.length
    if (taille > 8192) throw new Error('Configuration trop volumineuse')
    morceaux.push(morceau)
  }
  const valeur = JSON.parse(Buffer.concat(morceaux).toString('utf8'))
  const decoder = (v) => {
    if (typeof v !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(v)) throw new Error('Cle invalide')
    const b = Buffer.from(v, 'base64')
    if (b.length !== 32 || b.toString('base64') !== v) throw new Error('Cle invalide')
    return b
  }
  if (!Array.isArray(valeur.lecture) || valeur.lecture.length > 4)
    throw new Error('Trousseau invalide')
  const adresse = new URL(valeur.connexion)
  if (!['postgres:', 'postgresql:'].includes(adresse.protocol) || adresse.search || adresse.hash)
    throw new Error('Connexion invalide')
  const locale = ['localhost', '127.0.0.1'].includes(adresse.hostname)
  const args = process.argv.slice(2)
  if (args.length !== 1 || !['--inventaire', '--appliquer'].includes(args[0]))
    throw new Error('Mode explicite obligatoire')
  return {
    connexion: valeur.connexion,
    locale,
    appliquer: args[0] === '--appliquer',
    cles: {
      historique: decoder(valeur.historique),
      active: decoder(valeur.active),
      lecture: valeur.lecture.map(decoder),
    },
  }
}
let db
try {
  const config = await configuration()
  db = new Client({
    connectionString: config.connexion,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    lock_timeout: 1000,
    ssl: config.locale ? false : { rejectUnauthorized: true },
  })
  await db.connect()
  const reference = JSON.parse(
    await readFile(
      new URL(
        config.locale
          ? '../tests/fixtures/schema-locale.json'
          : '../lib/exploitation/schema-production.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  const { rows } = await db.query('select public.empreinte_schema() as empreinte')
  const empreinte = rows[0]?.empreinte
  if (!isDeepStrictEqual(reference, empreinte)) throw new Error('Schema different')
  const verrou = await db.query(
    "select pg_try_advisory_lock(hashtextextended('cloison:rotation-administrative',0)) as obtenu",
  )
  if (verrou.rows[0]?.obtenu !== true) throw new Error('Rotation deja en cours')
  const bilan = await rescellerEnveloppes(db, config.cles, { appliquer: config.appliquer })
  console.log(JSON.stringify(bilan))
  if (bilan.echecs || bilan.courses || bilan.limite) process.exitCode = 1
} catch {
  console.error('Rotation administrative interrompue ; aucun secret journalise.')
  process.exitCode = 1
} finally {
  await db?.end().catch(() => {})
}
