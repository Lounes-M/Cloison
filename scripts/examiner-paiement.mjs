import { Client } from 'pg'
import { lstat, open, realpath } from 'node:fs/promises'
import { resolve, dirname, basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { diagnostiquerPaiement } from './diagnostic-paiement.mjs'

export function configurationDiagnostic(valeur) {
  if (!valeur || Object.keys(valeur).sort().join(',') !== 'connexion,destination,reference')
    throw new Error('Configuration invalide')
  if (
    typeof valeur.connexion !== 'string' ||
    typeof valeur.destination !== 'string' ||
    !valeur.destination
  )
    throw new Error('Configuration invalide')
  if (typeof valeur.reference !== 'string' || !/^cs_[A-Za-z0-9_]{1,196}$/.test(valeur.reference))
    throw new Error('Reference invalide')
  const adresse = new URL(valeur.connexion)
  if (
    !['postgres:', 'postgresql:'].includes(adresse.protocol) ||
    !adresse.hostname ||
    adresse.search ||
    adresse.hash
  )
    throw new Error('Connexion invalide')
  return { ...valeur, locale: ['localhost', '127.0.0.1', '[::1]'].includes(adresse.hostname) }
}

export async function ecrireDiagnostic(destination, diagnostic) {
  // Un repertoire prive existant est obligatoire, y compris pour refuser les ACL
  // non verifiables sur les plateformes sans uid POSIX.
  const parent = await realpath(dirname(resolve(destination)))
  const stat = await lstat(parent)
  if (!process.getuid || !stat.isDirectory() || stat.uid !== process.getuid() || stat.mode & 0o077)
    throw new Error('Repertoire prive obligatoire')
  const contenu = JSON.stringify(diagnostic)
  const rapport =
    JSON.stringify(
      {
        format: 'cloison-diagnostic-paiement-v1',
        sha256: createHash('sha256').update(contenu).digest('hex'),
        // Chaine exacte pour que le hash soit reproductible sans normalisation JSON.
        contenu,
      },
      null,
      2,
    ) + '\n'
  if (Buffer.byteLength(rapport) > 4 * 1024 * 1024) throw new Error('Rapport trop volumineux')
  const fichier = await open(join(parent, basename(destination)), 'wx', 0o600)
  try {
    await fichier.writeFile(rapport, 'utf8')
    await fichier.sync()
  } finally {
    await fichier.close()
  }
}

export async function examinerPaiement(config) {
  const c = configurationDiagnostic(config)
  const db = new Client({
    connectionString: c.connexion,
    connectionTimeoutMillis: 5000,
    query_timeout: 6000,
    ssl: c.locale ? false : { rejectUnauthorized: true },
  })
  // Une rupture idle ne doit pas exposer l'erreur du pilote via un evenement non gere.
  db.on('error', () => {})
  try {
    await db.connect()
    const diagnostic = await diagnostiquerPaiement(db, c.reference)
    await ecrireDiagnostic(c.destination, diagnostic)
  } finally {
    await db.end().catch(() => {})
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2 || process.stdin.isTTY)
      throw new Error('Entree privee obligatoire')
    const morceaux = []
    let taille = 0
    for await (const morceau of process.stdin) {
      taille += morceau.length
      if (taille > 8192) throw new Error('Configuration trop volumineuse')
      morceaux.push(morceau)
    }
    await examinerPaiement(JSON.parse(Buffer.concat(morceaux).toString('utf8')))
    console.log('Diagnostic prive enregistre ; aucune anomalie acquittee.')
  } catch {
    console.error('Diagnostic indisponible ; aucune donnee financiere journalisee.')
    process.exitCode = 1
  }
}
