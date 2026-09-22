import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ORIGINE = 'https://www.cloison.immo'
const controles = [
  { id: 'accueil', chemin: '/', titre: 'Cloison · Le coffre à trois clés' },
  { id: 'agences', chemin: '/agences', titre: 'Agences · Cloison' },
  { id: 'connexion', chemin: '/connexion', titre: 'Connexion · Cloison', prive: true },
  { id: 'nonce-renouvele', chemin: '/connexion', titre: 'Connexion · Cloison', prive: true },
  { id: 'agence-anonyme', chemin: '/espace', destination: '/connexion', prive: true },
  { id: 'garant-anonyme', chemin: '/garant', destination: '/lien-invalide', prive: true },
  { id: 'locataire-anonyme', chemin: '/locataire', destination: '/lien-invalide', prive: true },
  { id: 'supervision-privee', chemin: '/api/supervision', api: true },
  { id: 'schema-prive', chemin: '/api/schema', api: true },
  { id: 'maintenance-privee', chemin: '/api/maintenance/etat', api: true },
  { id: 'paiements-prives', chemin: '/api/paiement/etat', api: true },
  { id: 'connecteurs-prives', chemin: '/api/connecteurs/v1/dossiers', api: true },
]

function exiger(condition) {
  if (!condition) throw new Error('Controle de production non confirme')
}

function politique(headers, prive, nonces) {
  const directives = new Map()
  for (const morceau of (headers.get('content-security-policy') ?? '').split(';')) {
    const [nom, ...valeurs] = morceau.trim().split(/\s+/)
    if (!nom) continue
    exiger(!directives.has(nom))
    directives.set(nom, valeurs)
  }
  for (const [nom, valeur] of [
    ['default-src', "'self'"],
    ['object-src', "'none'"],
    ['frame-ancestors', "'none'"],
    ['base-uri', "'self'"],
  ])
    exiger(directives.get(nom)?.join(' ') === valeur)
  exiger(directives.has('upgrade-insecure-requests'))
  const scripts = directives.get('script-src') ?? []
  exiger(!scripts.includes("'unsafe-eval'"))
  if (!prive) {
    exiger(
      scripts.length === 2 && scripts.includes("'self'") && scripts.includes("'unsafe-inline'"),
    )
    return
  }
  const nonce = scripts.find((v) => /^'nonce-[A-Za-z0-9+/]{22}=='$/.test(v))
  exiger(
    scripts.length === 3 &&
      scripts.includes("'self'") &&
      scripts.includes("'strict-dynamic'") &&
      nonce &&
      !nonces.has(nonce),
  )
  nonces.add(nonce)
}

async function lirePage(reponse, signal) {
  const longueur = reponse.headers.get('content-length')
  exiger(longueur === null || (/^\d+$/.test(longueur) && Number(longueur) <= 1024 * 1024))
  exiger(reponse.body)
  const lecteur = reponse.body.getReader()
  const annuler = () => {
    void lecteur.cancel().catch(() => {})
  }
  signal.addEventListener('abort', annuler, { once: true })
  let taille = 0
  const blocs = []
  try {
    signal.throwIfAborted()
    for (;;) {
      const { value, done } = await lecteur.read()
      signal.throwIfAborted()
      if (done) break
      taille += value.byteLength
      exiger(taille <= 1024 * 1024)
      blocs.push(value)
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(blocs, taille))
  } finally {
    signal.removeEventListener('abort', annuler)
    annuler()
    lecteur.releaseLock()
  }
}

/** Requetes anonymes sur une origine fixe. Aucun contenu distant n'est journalise. */
export async function verifierProduction(transport = fetch, signalAppelant) {
  const budget = AbortSignal.timeout(60000)
  const signalGlobal = signalAppelant ? AbortSignal.any([budget, signalAppelant]) : budget
  const nonces = new Set()
  const resultats = []
  for (const controle of controles) {
    let reponse
    try {
      const signal = AbortSignal.any([signalGlobal, AbortSignal.timeout(10000)])
      signal.throwIfAborted()
      reponse = await transport(ORIGINE + controle.chemin, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        signal,
      })
      signal.throwIfAborted()
      exiger(!reponse.redirected)
      exiger(reponse.headers.get('x-content-type-options') === 'nosniff')
      exiger(reponse.headers.get('x-frame-options') === 'DENY')
      exiger(reponse.headers.get('referrer-policy') === 'strict-origin-when-cross-origin')
      exiger(reponse.headers.get('cross-origin-opener-policy') === 'same-origin')
      exiger(
        /(?:^|;)\s*max-age=(\d+)(?:;|$)/i.exec(
          reponse.headers.get('strict-transport-security') ?? '',
        )?.[1] >= 31536000,
      )
      politique(reponse.headers, controle.prive, nonces)
      if (controle.api || controle.prive)
        exiger(
          reponse.headers
            .get('cache-control')
            ?.split(',')
            .some((v) => v.trim().toLowerCase() === 'no-store'),
        )
      if (controle.api) exiger(reponse.status === 401 && !reponse.headers.has('location'))
      else if (controle.destination) {
        exiger(reponse.status === 307 && reponse.headers.get('location') === controle.destination)
      } else {
        exiger(reponse.status === 200)
        exiger(reponse.headers.get('content-type')?.split(';')[0].trim() === 'text/html')
        const html = await lirePage(reponse, signal)
        exiger(
          html.includes(`<title>${controle.titre}</title>`) &&
            /<html\b[^>]*\blang="fr"/.test(html) &&
            /<h1\b/.test(html) &&
            /<main\b/.test(html),
        )
        if (controle.prive)
          exiger(/<meta\s+name="robots"\s+content="noindex, nofollow"\s*\/?\s*>/.test(html))
      }
      resultats.push({ id: controle.id, conforme: true })
    } catch {
      resultats.push({ id: controle.id, conforme: false })
    } finally {
      if (reponse?.body && !reponse.body.locked) void reponse.body.cancel().catch(() => {})
    }
  }
  return { conforme: resultats.every((r) => r.conforme), controles: resultats }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const rapport = await verifierProduction()
    console.log(JSON.stringify(rapport))
    if (!rapport.conforme) process.exitCode = 1
  } catch {
    console.error('Recette de production indisponible')
    process.exitCode = 1
  }
}
