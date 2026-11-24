import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { optionsCookieSessionAgence } from '@/lib/acces/cookies-agence'
import { env } from '@/lib/env'
import { fetchAgence } from '@/lib/http/fetch-agence'
import { estPageNoncePublique, nouveauNonce, politiqueAvecNonce } from '@/lib/securite/csp'

/**
 * Deux choses, pour l'applicatif seulement (plus un en-tete qui l'ecarte des
 * moteurs de recherche).
 *
 * 1. Un nonce par requete, et la Content-Security-Policy qui le porte. Next
 *    lit le nonce dans l'en-tete `Content-Security-Policy` de la requete
 *    entrante pour le poser sur ses propres scripts ; la meme politique part
 *    dans la reponse, ou le navigateur l'applique. Un script qui n'a pas ce
 *    nonce ne s'execute pas, et c'est tout l'interet.
 *
 * 2. Le rafraichissement de la session d'agence, sous `/espace` et sur
 *    `/connexion/securite`, qui verifie aussi la session avant le code MFA.
 *    Un jeton Supabase expire vite et se renouvelle avec un jeton de
 *    rafraichissement. Un composant serveur ne peut pas ecrire de cookie :
 *    sans ce passage, la session mourrait a la premiere expiration et
 *    l'agence serait deconnectee en pleine consultation.
 *
 * Deux precautions qui ne se voient pas et qui comptent.
 *
 * - On appelle `getUser()`, pas `getSession()`. Le second lit le cookie et le
 *   croit ; le premier fait verifier le jeton par Supabase. C'est ici que la
 *   difference est la plus dangereuse, puisque ce code tourne avant tout le
 *   reste.
 *
 * - La reponse rendue est celle que le client Supabase a pu modifier.
 *   Fabriquer une reponse neuve apres coup perdrait les cookies rafraichis, et
 *   la session serait renouvelee sans que personne ne le sache.
 */
export async function proxy(requete: NextRequest) {
  const nonce = nouveauNonce()
  const chemin = requete.nextUrl.pathname
  const remise = chemin === '/remise-donnees'
  const ouverture = estPageNoncePublique(chemin)
  const politique = politiqueAvecNonce(nonce)

  // La requete transmise a Next porte la politique, donc le nonce. `x-nonce`
  // la double pour qui en aurait besoin dans un composant.
  const suivant = () => {
    const entetes = new Headers(requete.headers)
    entetes.set('content-security-policy', politique)
    entetes.set('x-nonce', nonce)
    return NextResponse.next({ request: { headers: entetes } })
  }

  let reponse = suivant()
  // Le dernier lot ecrit par le SDK : une redirection doit le reporter, sinon
  // un cookie rafraichi ou efface resterait sur la reponse qu'on jette.
  let cookiesPoses: {
    name: string
    value: string
    options?: Parameters<NextResponse['cookies']['set']>[2]
  }[] = []

  if (chemin.startsWith('/espace') || chemin === '/connexion/securite') {
    // Les memes accesseurs que partout ailleurs : une variable absente doit
    // echouer bruyamment, pas se replier sur une chaine vide qui produirait
    // une erreur reseau incomprehensible trois appels plus loin.
    const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
      cookieOptions: optionsCookieSessionAgence(),
      global: { fetch: fetchAgence },
      cookies: {
        getAll: () => requete.cookies.getAll(),
        setAll: (aPoser) => {
          cookiesPoses = aPoser
          for (const { name, value } of aPoser) requete.cookies.set(name, value)
          reponse = suivant()
          for (const { name, value, options } of aPoser) reponse.cookies.set(name, value, options)
        },
      },
    })

    const { data } = await supabase.auth.getUser()
    // Sans session, toute adresse sous `/espace` renvoie a la connexion, y
    // compris une adresse qui n'a pas de page (`/espace/dossiers`). Il n'y a
    // pas de parametre de retour : le lien magique arrive toujours sur
    // `/espace`, et en inventer un ouvrirait une redirection.
    if (chemin.startsWith('/espace') && !data.user) {
      const redirection = NextResponse.redirect(new URL('/connexion', requete.url), 307)
      for (const { name, value, options } of cookiesPoses) {
        redirection.cookies.set(name, value, options)
      }
      redirection.headers.set('Content-Security-Policy', politique)
      redirection.headers.set('X-Robots-Tag', 'noindex, nofollow')
      return redirection
    }
  }

  reponse.headers.set('Content-Security-Policy', politique)
  // Rien de l'applicatif ne doit finir dans un moteur de recherche : ni un
  // lien porteur de jeton, ni une redirection, ni une route sans metadonnees.
  // `/demarrer` reste indexable : c'est une page publique, pas un espace.
  if (!ouverture) reponse.headers.set('X-Robots-Tag', 'noindex, nofollow')
  if (remise) {
    reponse.headers.set('Cache-Control', 'no-store')
    reponse.headers.set('Referrer-Policy', 'no-referrer')
  }
  return reponse
}

export const config = {
  /**
   * L'applicatif, et rien d'autre.
   *
   * Le site public est statique et garde sa propre politique, declaree dans
   * `next.config.ts`, sauf `/demarrer` et `/en/demarrer` : le formulaire
   * d'ouverture porte un nonce, le reste du marketing non. Le faire passer
   * entierement par ici lui couterait un rendu dynamique par page vue.
   *
   * Les sept premiers motifs sont le miroir de `SEGMENTS_APPLICATIFS`, les
   * deux derniers celui de `PAGES_NONCE_PUBLIQUES`, dans `lib/securite/csp.ts`.
   * Next exige que cette liste soit ecrite en clair, sans variable ; un test
   * verifie qu'elle ne diverge pas.
   */
  matcher: [
    '/espace/:path*',
    '/connexion/:path*',
    '/locataire/:path*',
    '/garant/:path*',
    '/lien/:path*',
    '/lien-invalide/:path*',
    '/remise-donnees/:path*',
    '/demarrer/:path*',
    '/en/demarrer/:path*',
  ],
}
