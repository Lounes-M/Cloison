import { fstatSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

const ORIGINE = 'https://api.docage.com'
const MAX_REPONSE = 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const selection = z.strictObject({
  environnement: z.enum(['sandbox', 'production']),
  transaction: z.string().regex(UUID),
})
// TransactionGlobalStatus, traduit comme dans lib/signature/client-docage.ts.
const ETATS = {
  0: 'draft',
  1: 'approval',
  2: 'paused',
  3: 'ongoing',
  4: 'ongoing',
  5: 'done',
  6: 'expired',
  7: 'declined',
  8: 'canceled',
}
const NOMS = {
  draft: 0,
  scheduled: 1,
  waitinginformations: 2,
  active: 3,
  validated: 4,
  signed: 5,
  expired: 6,
  refused: 7,
  aborted: 8,
}
const systemeCliSupporte = () => ['linux', 'darwin'].includes(process.platform)
const refuser = () => {
  throw new Error('Lecture Docage indisponible.')
}
const champ = (objet, nom) => objet[nom] ?? objet[nom.charAt(0).toUpperCase() + nom.slice(1)]

function etat(valeur) {
  const cle =
    typeof valeur === 'number'
      ? valeur
      : typeof valeur === 'string'
        ? (NOMS[valeur.toLowerCase()] ?? (/^\d$/.test(valeur) ? Number(valeur) : -1))
        : -1
  return Object.hasOwn(ETATS, cle) ? ETATS[cle] : null
}

/**
 * GET unique d'une transaction connue, sans mutation ni telechargement. Rend
 * l'etat commun du registre et le marquage de test, rien d'autre : une
 * transaction Docage contient des identites et des fichiers.
 */
export async function lireDocage(valeur, identifiants, requete = fetch) {
  const p = selection.safeParse(valeur)
  if (
    !p.success ||
    !identifiants ||
    typeof identifiants.courriel !== 'string' ||
    typeof identifiants.cle !== 'string' ||
    !z.email().max(254).safeParse(identifiants.courriel).success ||
    !/^[!-~]{1,1024}$/.test(identifiants.cle)
  )
    refuser()
  const signal = AbortSignal.timeout(5000)
  let lecteur
  const annuler = () => {
    void lecteur?.cancel().catch(() => {})
  }
  try {
    const autorisation = Buffer.from(`${identifiants.courriel}:${identifiants.cle}`).toString(
      'base64',
    )
    const reponse = await requete(`${ORIGINE}/Transactions/ById/${p.data.transaction}`, {
      method: 'GET',
      headers: { Authorization: `Basic ${autorisation}`, Accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      signal,
    })
    const longueur = reponse.headers.get('content-length')
    if (
      reponse.status !== 200 ||
      reponse.redirected ||
      reponse.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json' ||
      (longueur !== null && (!/^\d+$/.test(longueur) || Number(longueur) > MAX_REPONSE)) ||
      !reponse.body
    ) {
      void reponse.body?.cancel().catch(() => {})
      refuser()
    }
    lecteur = reponse.body.getReader()
    signal.addEventListener('abort', annuler, { once: true })
    const blocs = []
    let taille = 0
    signal.throwIfAborted()
    for (;;) {
      const { value, done } = await lecteur.read()
      signal.throwIfAborted()
      if (done) break
      taille += value.byteLength
      if (taille > MAX_REPONSE) refuser()
      blocs.push(value)
    }
    const t = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(blocs, taille)),
    )
    if (!t || typeof t !== 'object' || Array.isArray(t)) refuser()
    const id = champ(t, 'id')
    if (typeof id !== 'string' || id.toLowerCase() !== p.data.transaction.toLowerCase()) refuser()
    const test = champ(t, 'isTest')
    // Une transaction de test n'a aucune valeur juridique : l'environnement doit correspondre.
    if (typeof test !== 'boolean' || test !== (p.data.environnement === 'sandbox')) refuser()
    const e = etat(champ(t, 'globalStatus'))
    if (!e) refuser()
    return { etat: e, test }
  } catch {
    refuser()
  } finally {
    signal.removeEventListener('abort', annuler)
    annuler()
    lecteur?.releaseLock()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let secret
  try {
    if (!systemeCliSupporte()) refuser()
    if (process.argv.length !== 2 || process.stdin.isTTY) refuser()
    const stat = fstatSync(3)
    if (!stat.isFile() || stat.size < 3 || stat.size > 1300 || (stat.mode & 0o077) !== 0) refuser()
    secret = Buffer.alloc(stat.size)
    if (readSync(3, secret, 0, secret.length, 0) !== secret.length) refuser()
    // Une seule ligne `courriel:cle`, comme l'authentification Basic de Docage.
    const texte = new TextDecoder('utf-8', { fatal: true }).decode(secret)
    const separateur = texte.indexOf(':')
    if (separateur < 1) refuser()
    const blocs = []
    let taille = 0
    for await (const bloc of process.stdin) {
      taille += bloc.length
      if (taille > 1024) refuser()
      blocs.push(bloc)
    }
    const valeur = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(blocs)),
    )
    const resultat = await lireDocage(valeur, {
      courriel: texte.slice(0, separateur),
      cle: texte.slice(separateur + 1),
    })
    console.log(JSON.stringify(resultat))
  } catch {
    console.error(
      systemeCliSupporte()
        ? 'Lecture Docage indisponible. Verifier acces API, environnement et transaction.'
        : 'Lecture Docage indisponible sur ce systeme.',
    )
    process.exitCode = 1
  } finally {
    secret?.fill(0)
  }
}
