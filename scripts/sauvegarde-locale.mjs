import { fstatSync, readSync } from 'node:fs'
import { lstat, readdir, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve, join, dirname, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { sceller, ouvrir } from '../lib/coffre/enveloppe.ts'
import { verifierContratExport } from './contrat-export.mjs'
import { lireFichierBorne } from './lecture-fichier-bornee.mjs'

// Petit export pilote, charge en memoire. Aucun appel SQL ou reseau dans cet outil.
const MAX_FICHIER = 64 * 1024 * 1024
const MAX_TOTAL = 128 * 1024 * 1024
const MAX_ARCHIVE = 180 * 1024 * 1024
const MAX_FICHIERS = 1000
const empreinte = (octets) => createHash('sha256').update(octets).digest('hex')

async function verifierParents(chemin) {
  let courant = resolve(chemin)
  for (;;) {
    const stat = await lstat(courant)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('Repertoire non direct refuse.')
    const parent = dirname(courant)
    if (parent === courant) return
    courant = parent
  }
}

function verifierCle(cle) {
  if (!Buffer.isBuffer(cle) || cle.length !== 32) throw new Error('Cle de sauvegarde invalide.')
}

function verifierChemin(chemin) {
  if (
    typeof chemin !== 'string' ||
    chemin.length > 512 ||
    isAbsolute(chemin) ||
    chemin.includes('\\') ||
    !chemin.split('/').every((partie) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(partie)) ||
    !(chemin === 'base.dump' || chemin === 'configuration.json' || chemin.startsWith('objets/'))
  )
    throw new Error('Chemin de sauvegarde refuse.')
}

/** Source figee : base.dump, configuration.json sans secrets et objets/. */
export async function sauvegarder(source, destination, cle) {
  verifierCle(cle)
  await verifierParents(source)
  await verifierParents(dirname(resolve(destination)))
  const fichiers = []
  let total = 0
  async function parcourir(repertoire, prefixe = '') {
    for (const entree of await readdir(repertoire, { withFileTypes: true })) {
      const chemin = prefixe + entree.name
      if (entree.isSymbolicLink()) throw new Error('Lien symbolique refuse.')
      if (entree.isDirectory()) {
        if (chemin !== 'objets' && !chemin.startsWith('objets/'))
          throw new Error('Repertoire refuse.')
        verifierChemin(chemin + '/controle')
        await parcourir(join(repertoire, entree.name), chemin + '/')
      } else {
        verifierChemin(chemin)
        if (fichiers.length >= MAX_FICHIERS) throw new Error('Trop de fichiers.')
        const octets = await lireFichierBorne(
          join(repertoire, entree.name),
          Math.min(MAX_FICHIER, MAX_TOTAL - total),
        )
        total += octets.length
        if (total > MAX_TOTAL) throw new Error('Export trop volumineux.')
        fichiers.push({
          chemin,
          taille: octets.length,
          sha256: empreinte(octets),
          contenu: octets.toString('base64'),
        })
      }
    }
  }
  await parcourir(source)
  if (
    !fichiers.some((f) => f.chemin === 'base.dump') ||
    !fichiers.some((f) => f.chemin === 'configuration.json')
  ) {
    throw new Error('Export incomplet : base et configuration requises.')
  }
  const octets = new Map(fichiers.map((f) => [f.chemin, Buffer.from(f.contenu, 'base64')]))
  const contrat = verifierContratExport(octets.get('configuration.json'), octets)
  const archive = sceller(Buffer.from(JSON.stringify({ version: 2, fichiers })), cle)
  await writeFile(destination, archive, { flag: 'wx', mode: 0o600 })
  return { fichiers: fichiers.length, octets: total, sha256: empreinte(archive), ...contrat }
}

/** Extraction uniquement, dans un repertoire neuf. N'execute jamais base.dump. */
export async function restaurer(archive, destination, cle) {
  verifierCle(cle)
  await verifierParents(dirname(resolve(destination)))
  let manifeste
  try {
    manifeste = JSON.parse(
      ouvrir(await lireFichierBorne(archive, MAX_ARCHIVE), cle).toString('utf8'),
    )
  } catch {
    throw new Error('Archive illisible, alteree ou cle incorrecte.')
  }
  if (
    ![1, 2].includes(manifeste?.version) ||
    !Array.isArray(manifeste.fichiers) ||
    manifeste.fichiers.length > MAX_FICHIERS
  ) {
    throw new Error('Format de sauvegarde refuse.')
  }
  const chemins = new Set()
  const valides = []
  let total = 0
  for (const fichier of manifeste.fichiers) {
    verifierChemin(fichier?.chemin)
    if (chemins.has(fichier.chemin) || typeof fichier.contenu !== 'string')
      throw new Error('Inventaire invalide.')
    chemins.add(fichier.chemin)
    const octets = Buffer.from(fichier.contenu, 'base64')
    total += octets.length
    if (
      octets.length > MAX_FICHIER ||
      total > MAX_TOTAL ||
      octets.length !== fichier.taille ||
      empreinte(octets) !== fichier.sha256 ||
      octets.toString('base64') !== fichier.contenu
    ) {
      throw new Error('Integrite du fichier invalide.')
    }
    valides.push({ chemin: fichier.chemin, octets })
  }
  if (!chemins.has('base.dump') || !chemins.has('configuration.json'))
    throw new Error('Export incomplet.')
  const octets = new Map(valides.map((f) => [f.chemin, f.octets]))
  const contrat =
    manifeste.version === 2
      ? verifierContratExport(octets.get('configuration.json'), octets)
      : { verification: 'integrite-seule' }
  // Le contrat de la version 2 est valide AVANT toute creation de destination.
  // mkdir exclusif : aucune ecriture si destination deja presente, meme vide.
  await mkdir(destination, { mode: 0o700 })
  try {
    for (const fichier of valides) {
      const chemin = join(destination, fichier.chemin)
      await mkdir(dirname(chemin), { recursive: true, mode: 0o700 })
      await writeFile(chemin, fichier.octets, { flag: 'wx', mode: 0o600 })
    }
  } catch (erreur) {
    await rm(destination, { recursive: true, force: true })
    throw erreur
  }
  return { fichiers: valides.length, octets: total, ...contrat }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [commande, source, destination] = process.argv.slice(2)
  try {
    if (
      !['creer', 'extraire'].includes(commande) ||
      !source ||
      !destination ||
      process.argv.length !== 5
    ) {
      throw new Error(
        'Usage : node scripts/sauvegarde-locale.mjs creer|extraire source destination',
      )
    }
    // La cle arrive par descripteur 3, jamais en argument, log ou dans l'archive.
    if (!fstatSync(3).isFile() || fstatSync(3).size !== 32 || (fstatSync(3).mode & 0o077) !== 0)
      throw new Error('Descripteur de cle invalide.')
    const cle = Buffer.alloc(32)
    if (readSync(3, cle, 0, 32, 0) !== 32) throw new Error('Cle incomplete.')
    const resultat = await (commande === 'creer' ? sauvegarder : restaurer)(
      source,
      destination,
      cle,
    )
    cle.fill(0)
    console.log(JSON.stringify(resultat))
  } catch {
    console.error(
      'Sauvegarde ou extraction refusee. Verifier le format, la cle et les chemins locaux.',
    )
    process.exitCode = 1
  }
}
