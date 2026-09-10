import 'server-only'
import {
  base64url,
  createRemoteJWKSet,
  customFetch,
  decodeProtectedHeader,
  compactVerify,
} from 'jose'
import type { FetchImplementation } from 'jose'

export type EnvironnementUniversign = 'alpha' | 'production'
const ORIGINES = {
  alpha: 'https://api.alpha.universign.com',
  production: 'https://api.universign.com',
} as const
const ETATS = {
  'transaction.lifecycle.created': 'draft',
  'transaction.lifecycle.started': 'started',
  'transaction.lifecycle.paused': 'paused',
  'transaction.lifecycle.cancelled': 'cancelled',
  'transaction.lifecycle.expired': 'expired',
  'transaction.lifecycle.completed': 'completed',
} as const

export type NotificationUniversign = {
  evenement: string
  transaction: string
  etat: (typeof ETATS)[keyof typeof ETATS]
  creeLe: number
}

const indisponible = () => new Error('Authentification Universign indisponible')
const chargerClefs: FetchImplementation = async (url, options) => {
  const reponse = await fetch(url, { ...options, cache: 'no-store' })
  if (
    reponse.status !== 200 ||
    Number(reponse.headers.get('content-length')) > 65536 ||
    !reponse.body
  ) {
    void reponse.body?.cancel().catch(() => {})
    throw indisponible()
  }
  const lecteur = reponse.body.getReader()
  const annuler = () => {
    void lecteur.cancel().catch(() => {})
  }
  options.signal.addEventListener('abort', annuler, { once: true })
  const blocs: Uint8Array[] = []
  let taille = 0
  try {
    options.signal.throwIfAborted()
    while (true) {
      const { value, done } = await lecteur.read()
      options.signal.throwIfAborted()
      if (done) break
      taille += value.byteLength
      if (taille > 65536) throw indisponible()
      blocs.push(value)
    }
    const texte = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(blocs, taille))
    const jeu: unknown = JSON.parse(texte)
    if (
      !jeu ||
      typeof jeu !== 'object' ||
      !('keys' in jeu) ||
      !Array.isArray(jeu.keys) ||
      !jeu.keys.length ||
      jeu.keys.length > 16
    )
      throw indisponible()
    return new Response(texte, { headers: { 'content-type': 'application/json' } })
  } finally {
    options.signal.removeEventListener('abort', annuler)
    annuler()
    lecteur.releaseLock()
  }
}

/** Creer une fois par environnement, puis reutiliser le cache de clefs publiques. */
export function creerVerificateurUniversign(environnement: EnvironnementUniversign) {
  if (environnement !== 'alpha' && environnement !== 'production') throw indisponible()
  let repriseApres = 0
  const clefs = createRemoteJWKSet(new URL(`${ORIGINES[environnement]}/v1/webhooks/jwks.json`), {
    timeoutDuration: 3000,
    cooldownDuration: 30000,
    cacheMaxAge: 600000,
    [customFetch]: async (url, options) => {
      if (Date.now() < repriseApres) throw indisponible()
      try {
        return await chargerClefs(url, options)
      } catch {
        repriseApres = Date.now() + 30000
        throw indisponible()
      }
    },
  })
  return async (
    corps: Uint8Array,
    signature: string | null,
  ): Promise<NotificationUniversign | null> => {
    try {
      if (!corps.byteLength || corps.byteLength > 65536 || !signature || signature.length > 6144)
        return null
      const morceaux = /^([A-Za-z0-9_-]+)\.\.([A-Za-z0-9_-]+)$/.exec(signature)
      if (!morceaux) return null
      const entete = decodeProtectedHeader(signature)
      if (
        entete.alg !== 'PS256' ||
        typeof entete.kid !== 'string' ||
        !/^scd_[A-Za-z0-9_-]{1,192}$/.test(entete.kid) ||
        Object.keys(entete).some((cle) => cle !== 'alg' && cle !== 'kid')
      )
        return null
      // Reconstituer le JWS sur les octets exacts, sans normaliser le JSON.
      await compactVerify(`${morceaux[1]}.${base64url.encode(corps)}.${morceaux[2]}`, clefs, {
        algorithms: ['PS256'],
      })
      const evenement = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(corps))
      const transaction = evenement?.payload?.object
      if (
        evenement?.object !== 'event' ||
        typeof evenement.id !== 'string' ||
        !/^evt_[A-Za-z0-9_-]{1,192}$/.test(evenement.id) ||
        typeof evenement.type !== 'string' ||
        !Object.hasOwn(ETATS, evenement.type) ||
        transaction?.object !== 'transaction' ||
        typeof transaction.id !== 'string' ||
        !/^tx_[A-Za-z0-9_-]{1,192}$/.test(transaction.id) ||
        transaction.state !== ETATS[evenement.type as keyof typeof ETATS] ||
        typeof evenement.createdAt !== 'number' ||
        !Number.isFinite(evenement.createdAt) ||
        evenement.createdAt <= 0 ||
        evenement.createdAt > Date.now() / 1000 + 300
      )
        return null
      // Aucune donnee de participant ni URL n'est propagee au consommateur.
      return {
        evenement: evenement.id,
        transaction: transaction.id,
        etat: transaction.state,
        creeLe: evenement.createdAt,
      }
    } catch {
      return null
    }
  }
}
