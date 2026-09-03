import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { env } from '@/lib/env'

/**
 * Le rafraichissement de la session d'agence.
 *
 * Un jeton Supabase expire vite et se renouvelle avec un jeton de
 * rafraichissement. Un composant serveur ne peut pas ecrire de cookie : sans ce
 * middleware, la session mourrait a la premiere expiration et l'agence serait
 * deconnectee en pleine consultation.
 *
 * Deux precautions qui ne se voient pas et qui comptent.
 *
 * 1. On appelle `getUser()`, pas `getSession()`. Le second lit le cookie et le
 *    croit ; le premier fait verifier le jeton par Supabase. C'est ici que la
 *    difference est la plus dangereuse, puisque ce code tourne avant tout le
 *    reste.
 *
 * 2. La reponse rendue est celle que le client Supabase a pu modifier. Fabriquer
 *    une reponse neuve apres coup perdrait les cookies rafraichis, et la session
 *    serait renouvelee sans que personne ne le sache.
 */
export async function middleware(requete: NextRequest) {
  let reponse = NextResponse.next({ request: requete })

  // Les memes accesseurs que partout ailleurs : une variable absente doit
  // echouer bruyamment, pas se replier sur une chaine vide qui produirait une
  // erreur reseau incomprehensible trois appels plus loin.
  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => requete.cookies.getAll(),
      setAll: (aPoser) => {
        for (const { name, value } of aPoser) requete.cookies.set(name, value)
        reponse = NextResponse.next({ request: requete })
        for (const { name, value, options } of aPoser) reponse.cookies.set(name, value, options)
      },
    },
  })

  await supabase.auth.getUser()

  return reponse
}

export const config = {
  /**
   * Seulement l'espace agence, et rien d'autre.
   *
   * Le site public est entierement statique : le faire passer par ici lui
   * couterait un rendu dynamique et une requete a Supabase par page vue, pour
   * rafraichir une session que ses visiteurs n'ont pas.
   *
   * `/connexion` est exclue pour la meme raison, moins evidente : personne n'y
   * a encore de session a rafraichir. Et la route de retour du lien n'en a pas
   * besoin non plus, puisqu'un gestionnaire de route peut poser ses cookies
   * lui-meme, ce qu'un composant serveur ne peut pas.
   */
  matcher: ['/espace/:path*'],
}
