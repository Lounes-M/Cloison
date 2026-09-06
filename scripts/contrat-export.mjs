import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

const MAX_CONFIGURATION = 2 * 1024 * 1024
const MAX_ROLES_SQL = 1024 * 1024
const MAX_TAR = 64 * 1024 * 1024
const hash = (octets) => createHash('sha256').update(octets).digest('hex')
const refuser = () => {
  throw new Error('Contrat de sauvegarde invalide.')
}

function objetStrict(objet, requis, optionnels = []) {
  if (!objet || typeof objet !== 'object' || Array.isArray(objet)) refuser()
  if (requis.some((cle) => !Object.hasOwn(objet, cle))) refuser()
  if (Object.keys(objet).some((cle) => !requis.includes(cle) && !optionnels.includes(cle)))
    refuser()
}
function integrite(description, octets) {
  if (
    !Number.isSafeInteger(description.taille) ||
    description.taille < 0 ||
    typeof description.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(description.sha256) ||
    !Buffer.isBuffer(octets) ||
    octets.length !== description.taille ||
    hash(octets) !== description.sha256
  )
    refuser()
}
function dateIso(valeur) {
  if (typeof valeur !== 'string') return false
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
      valeur,
    )
  if (!match || !Number.isFinite(Date.parse(valeur))) return false
  const [, annee, mois, jour, heure, minute, seconde] = match.map(Number)
  return (
    mois >= 1 &&
    mois <= 12 &&
    jour >= 1 &&
    jour <= new Date(Date.UTC(annee, mois, 0)).getUTCDate() &&
    heure <= 23 &&
    minute <= 59 &&
    seconde <= 59
  )
}
function nombreOctal(octets) {
  const valeur = octets.toString('ascii').replaceAll('\0', '').trim()
  if (!/^[0-7]+$/.test(valeur)) refuser()
  const nombre = parseInt(valeur, 8)
  if (!Number.isSafeInteger(nombre)) refuser()
  return nombre
}

/** Reconnaissance structurelle uniquement. Aucune execution de SQL ou import. */
function verifierTarPglite(dump) {
  let tar = dump
  if (dump[0] === 0x1f && dump[1] === 0x8b) {
    try {
      tar = gunzipSync(dump, { maxOutputLength: MAX_TAR })
    } catch {
      refuser()
    }
  }
  if (tar.length > MAX_TAR || tar.length < 2048 || tar.length % 512 !== 0) refuser()
  let position = 0
  let version = false,
    controle = false,
    donnees = false
  const chemins = new Set()
  while (position + 512 <= tar.length) {
    const entete = tar.subarray(position, position + 512)
    if (entete.every((octet) => octet === 0)) {
      if (tar.length - position < 1024 || !tar.subarray(position).every((octet) => octet === 0))
        refuser()
      if (!version || !controle || !donnees) refuser()
      return
    }
    if (entete.subarray(257, 263).toString() !== 'ustar\0') refuser()
    const attendu = nombreOctal(entete.subarray(148, 156))
    let somme = 0
    for (let i = 0; i < 512; i++) somme += i >= 148 && i < 156 ? 32 : entete[i]
    if (somme !== attendu) refuser()
    const nom = entete.subarray(0, 100).toString('utf8').split('\0')[0]
    const prefixe = entete.subarray(345, 500).toString('utf8').split('\0')[0]
    // dumpDataDir utilise /PG_VERSION etc. Rien n'est extrait ici ; les noms
    // servent seulement a reconnaitre un repertoire PostgreSQL coherent.
    const chemin = `${prefixe ? prefixe + '/' : ''}${nom}`.replace(/^\//, '').replace(/\/$/, '')
    if (
      !chemin ||
      chemin.length > 255 ||
      !chemin.split('/').every((partie) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(partie)) ||
      chemins.has(chemin)
    )
      refuser()
    chemins.add(chemin)
    const taille = nombreOctal(entete.subarray(124, 136))
    if (![0, 48, 53].includes(entete[156]) || (entete[156] === 53 && taille !== 0)) refuser()
    const fin = position + 512 + taille
    if (fin > tar.length) refuser()
    const contenu = tar.subarray(position + 512, fin)
    if (chemin === 'PG_VERSION') version = /^[0-9]{1,3}\n$/.test(contenu.toString('ascii'))
    if (chemin === 'global/pg_control') controle = taille === 8192
    if (/^base\/\d+\/\d+(?:[._][a-z0-9]+)*$/.test(chemin) && taille > 0) donnees = true
    position += 512 + Math.ceil(taille / 512) * 512
  }
  refuser()
}

/** fichiers est un Map de chemins relatifs vers leurs octets deja bornes. */
export function verifierContratExport(configuration, fichiers) {
  if (
    !Buffer.isBuffer(configuration) ||
    configuration.length === 0 ||
    configuration.length > MAX_CONFIGURATION ||
    !(fichiers instanceof Map)
  )
    refuser()
  let contrat
  try {
    contrat = JSON.parse(configuration.toString('utf8'))
  } catch {
    refuser()
  }
  objetStrict(contrat, ['version', 'formatBase', 'creeLe', 'base', 'objets'], ['rolesSql'])
  if (
    contrat.version !== 1 ||
    !['postgres-custom', 'pglite-tar'].includes(contrat.formatBase) ||
    !dateIso(contrat.creeLe)
  )
    refuser()
  if (
    Object.hasOwn(contrat, 'rolesSql') &&
    (contrat.formatBase !== 'postgres-custom' ||
      typeof contrat.rolesSql !== 'string' ||
      contrat.rolesSql.length === 0 ||
      Buffer.byteLength(contrat.rolesSql) > MAX_ROLES_SQL ||
      contrat.rolesSql.includes('\0'))
  )
    refuser()
  objetStrict(contrat.base, ['taille', 'sha256'])
  const dump = fichiers.get('base.dump')
  integrite(contrat.base, dump)
  if (!dump.length) refuser()
  if (contrat.formatBase === 'postgres-custom') {
    // Signature et champs initiaux de l'entete pg_dump custom moderne.
    // Cela ne garantit ni la validite du catalogue ni une restauration reussie.
    if (
      dump.length < 32 ||
      dump.subarray(0, 5).toString() !== 'PGDMP' ||
      dump[5] !== 1 ||
      dump[6] < 14 ||
      dump[8] < 1 ||
      dump[8] > 8 ||
      dump[9] < 1 ||
      dump[9] > 8 ||
      dump[10] !== 1
    )
      refuser()
  } else verifierTarPglite(dump)
  if (!Array.isArray(contrat.objets) || contrat.objets.length > 998) refuser()
  const attendus = new Set(['base.dump', 'configuration.json'])
  for (const objet of contrat.objets) {
    objetStrict(objet, ['chemin', 'taille', 'sha256'])
    const chemin = objet.chemin
    if (
      typeof chemin !== 'string' ||
      chemin.length > 512 ||
      !chemin.startsWith('objets/') ||
      !chemin.split('/').every((partie) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(partie)) ||
      attendus.has(chemin)
    )
      refuser()
    attendus.add(chemin)
    integrite(objet, fichiers.get(chemin))
  }
  if (
    attendus.size !== fichiers.size ||
    [...fichiers.keys()].some((chemin) => !attendus.has(chemin))
  )
    refuser()
  return { verification: 'contrat-valide', formatBase: contrat.formatBase }
}
