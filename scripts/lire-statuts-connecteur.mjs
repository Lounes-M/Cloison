import { fstatSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { lireJsonBorne } from './lire-json-borne.mjs'

const ADRESSE = 'https://www.cloison.immo/api/connecteurs/v1/dossiers'
const reference = z.string().min(8).max(32)
const page = z.strictObject({
  version: z.literal(1),
  dossiers: z
    .array(
      z.strictObject({
        reference,
        etat: z.enum(['a_completer', 'pret', 'en_cours', 'signe', 'clos']),
      }),
    )
    .max(50),
  suite: reference.nullable(),
})
export class ErreurLectureStatuts extends Error {
  constructor(code, reessayerApres = null) {
    super('Lecture des statuts indisponible.')
    this.name = 'ErreurLectureStatuts'
    this.code = code
    this.reessayerApres = reessayerApres
  }
}
const refuser = (code) => {
  throw new ErreurLectureStatuts(code)
}

/** Lecture complete seulement. Aucun effet dans le logiciel destinataire, aucune reprise. */
export async function lireTousLesStatuts(cle, { signal: appelant, requete = fetch } = {}) {
  if (typeof cle !== 'string' || !/^cloison_read_[A-Za-z0-9_-]{43}$/.test(cle))
    refuser('configuration')
  const budget = AbortSignal.any([AbortSignal.timeout(30000), ...(appelant ? [appelant] : [])])
  const debutLe = new Date().toISOString()
  const dossiers = [],
    references = new Set(),
    curseurs = new Set()
  let apres = null
  let signalCourant = budget
  try {
    for (let nombre = 1; nombre <= 50; nombre++) {
      budget.throwIfAborted()
      const signal = AbortSignal.any([budget, AbortSignal.timeout(10000)])
      signalCourant = signal
      const url = new URL(ADRESSE)
      if (apres !== null) url.searchParams.set('apres', apres)
      const reponse = await requete(url.href, {
        method: 'GET',
        redirect: 'error',
        cache: 'no-store',
        signal,
        headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' },
      })
      if (reponse.status !== 200) {
        void reponse.body?.cancel().catch(() => {})
        if (reponse.status === 401) refuser('non_autorise')
        if (reponse.status === 429) {
          const attente = reponse.headers.get('retry-after')
          const secondes = attente !== null && /^\d{1,5}$/.test(attente) ? Number(attente) : null
          throw new ErreurLectureStatuts(
            'limite',
            secondes !== null && secondes >= 1 && secondes <= 86400 ? secondes : null,
          )
        }
        refuser('indisponible')
      }
      if (
        reponse.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
      ) {
        void reponse.body?.cancel().catch(() => {})
        refuser('reponse_invalide')
      }
      let resultat
      try {
        resultat = page.parse(await lireJsonBorne(reponse, signal))
      } catch {
        refuser('reponse_invalide')
      }
      for (const dossier of resultat.dossiers) {
        if (references.has(dossier.reference)) refuser('pagination_invalide')
        references.add(dossier.reference)
        dossiers.push(dossier)
      }
      budget.throwIfAborted()
      if (resultat.suite === null)
        return { version: 1, debutLe, termineLe: new Date().toISOString(), pages: nombre, dossiers }
      if (
        resultat.dossiers.length !== 50 ||
        resultat.suite !== resultat.dossiers.at(-1).reference ||
        curseurs.has(resultat.suite)
      )
        refuser('pagination_invalide')
      curseurs.add(resultat.suite)
      apres = resultat.suite
    }
    refuser('volume_excessif')
  } catch (erreur) {
    if (signalCourant.aborted) refuser('interrompu')
    if (erreur instanceof ErreurLectureStatuts) throw erreur
    refuser('indisponible')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let cle
  try {
    if (!['linux', 'darwin'].includes(process.platform)) refuser('systeme_non_supporte')
    if (process.argv.length !== 2) refuser('configuration')
    const stat = fstatSync(3)
    if (!stat.isFile() || stat.size < 1 || stat.size > 128 || (stat.mode & 0o077) !== 0)
      refuser('configuration')
    cle = Buffer.alloc(stat.size)
    if (readSync(3, cle, 0, cle.length, 0) !== cle.length) refuser('configuration')
    const resultat = await lireTousLesStatuts(new TextDecoder('utf-8', { fatal: true }).decode(cle))
    process.stdout.on('error', () => {})
    await new Promise((resolve, reject) => {
      process.stdout.write(JSON.stringify(resultat) + '\n', (erreur) =>
        erreur ? reject(erreur) : resolve(),
      )
    })
  } catch (erreur) {
    const connue = erreur instanceof ErreurLectureStatuts
    process.stderr.write(
      JSON.stringify({
        erreur: connue ? erreur.code : 'indisponible',
        reessayerApres: connue ? erreur.reessayerApres : null,
      }) + '\n',
    )
    process.exitCode = 1
  } finally {
    cle?.fill(0)
  }
}
