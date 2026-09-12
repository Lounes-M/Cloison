import { fstatSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

const ORIGINES = {
  alpha: 'https://api.alpha.universign.com',
  production: 'https://api.universign.com',
}
const MAX_REPONSE = 1024 * 1024
const selection = z.strictObject({
  environnement: z.enum(['alpha', 'production']),
  transaction: z.string().regex(/^tx_[A-Za-z0-9_-]{1,192}$/),
})
const etats = z.enum(['draft', 'started', 'paused', 'cancelled', 'expired', 'completed'])
const refuser = () => {
  throw new Error('Lecture Universign indisponible.')
}

/** GET unique, sans pagination, mutation, document ni donnee de participant retournee. */
export async function lireUniversign(valeur, cleApi, requete = fetch) {
  const p = selection.safeParse(valeur)
  if (!p.success || typeof cleApi !== 'string' || !/^[!-~]{1,1024}$/.test(cleApi)) refuser()
  const signal = AbortSignal.timeout(5000)
  let lecteur
  const annuler = () => {
    void lecteur?.cancel().catch(() => {})
  }
  try {
    const reponse = await requete(
      `${ORIGINES[p.data.environnement]}/v1/transactions/${p.data.transaction}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${cleApi}`, Accept: 'application/json' },
        redirect: 'error',
        cache: 'no-store',
        signal,
      },
    )
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
    const valeur = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(blocs, taille)),
    )
    if (valeur?.object !== 'transaction' || valeur.id !== p.data.transaction) refuser()
    const etat = etats.safeParse(valeur.state)
    if (!etat.success) refuser()
    // Une transaction peut contenir des identites, URLs et messages : ne rien propager d'autre.
    return { etat: etat.data }
  } catch {
    refuser()
  } finally {
    signal.removeEventListener('abort', annuler)
    annuler()
    lecteur?.releaseLock()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let cle
  try {
    if (process.argv.length !== 2 || process.stdin.isTTY) refuser()
    const stat = fstatSync(3)
    if (!stat.isFile() || stat.size < 1 || stat.size > 1024 || (stat.mode & 0o077) !== 0) refuser()
    cle = Buffer.alloc(stat.size)
    if (readSync(3, cle, 0, cle.length, 0) !== cle.length) refuser()
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
    const resultat = await lireUniversign(
      valeur,
      new TextDecoder('utf-8', { fatal: true }).decode(cle),
    )
    console.log(JSON.stringify(resultat))
  } catch {
    console.error(
      'Lecture Universign indisponible. Verifier acces API, environnement et transaction.',
    )
    process.exitCode = 1
  } finally {
    cle?.fill(0)
  }
}
