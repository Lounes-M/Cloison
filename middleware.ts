import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { env } from '@/lib/env'
import { nouveauNonce, politiqueAvecNonce } from '@/lib/securite/csp'

/**
 * Deux choses, pour l'applicatif seulement.
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
export async function middleware(requete: NextRequest) {
  const nonce = nouveauNonce()
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

  if (
    requete.nextUrl.pathname.startsWith('/espace') ||
    requete.nextUrl.pathname === '/connexion/securite'
  ) {
    // Les memes accesseurs que partout ailleurs : une variable absente doit
    // echouer bruyamment, pas se replier sur une chaine vide qui produirait
    // une erreur reseau incomprehensible trois appels plus loin.
    const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
      cookies: {
        getAll: () => requete.cookies.getAll(),
        setAll: (aPoser) => {
          for (const { name, value } of aPoser) requete.cookies.set(name, value)
          reponse = suivant()
          for (const { name, value, options } of aPoser) reponse.cookies.set(name, value, options)
        },
      },
    })

    await supabase.auth.getUser()
  }

  reponse.headers.set('Content-Security-Policy', politique)
  return reponse
}

export const config = {
  /**
   * L'applicatif, et rien d'autre.
   *
   * Le site public est entierement statique et garde sa propre politique,
   * declaree dans `next.config.ts` : le faire passer par ici lui couterait un
   * rendu dynamique par page vue, pour un nonce qu'une page prerendue ne
   * peut pas porter.
   *
   * Cette liste est le miroir de `SEGMENTS_APPLICATIFS` dans
   * `lib/securite/csp.ts`. Next exige qu'elle soit ecrite en clair ici, sans
   * variable ; un test verifie que les deux ne divergent pas.
   */
  matcher: [
    '/espace/:path*',
    '/connexion/:path*',
    '/locataire/:path*',
    '/garant/:path*',
    '/lien/:path*',
    '/lien-invalide/:path*',
  ],
}
