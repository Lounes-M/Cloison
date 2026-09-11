import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { env } from '@/lib/env'
import { fetchAgence } from '@/lib/http/fetch-agence'

/**
 * La session d'un collaborateur d'agence.
 *
 * C'est le troisieme et dernier chemin d'acces du produit, et il ne ressemble
 * a aucun des deux autres. `anon` n'a pas de session du tout. Le garant et le
 * locataire portent un jeton de capacite que nous signons nous-memes
 * (`lib/acces/session.ts`). L'agence, elle, a un vrai compte, et c'est Supabase
 * Auth qui l'emet.
 *
 * L'ADR 0002 explique pourquoi cette dissymetrie est voulue plutot que subie :
 * l'agence revient, sur des dizaines de dossiers, avec plusieurs
 * collaborateurs, et « chaque consultation laisse une trace » n'a de sens que
 * si la trace nomme une personne.
 *
 * Le jeton emis par Supabase porte `role: authenticated`. La connexion prend
 * donc le role Postgres du meme nom, et les politiques ecrites `to
 * authenticated` s'appliquent. Un porteur de lien ne peut pas les atteindre,
 * quelle que soit l'erreur commise dans une clause `using` : c'est la defense
 * en profondeur de l'ADR 0002, et elle tient au role, pas a nous.
 */

/**
 * Client lie aux cookies de la requete.
 *
 * `getAll` et `setAll` plutot que l'ancien trio `get`/`set`/`remove` : c'est
 * l'interface que `@supabase/ssr` attend desormais, et la seule qui sache
 * ecrire plusieurs cookies quand le jeton est trop gros pour un seul.
 *
 * L'ecriture est enveloppee : dans un composant serveur, Next interdit de
 * poser un cookie, et l'exception n'a rien a nous apprendre. Le rafraichissement
 * a lieu dans le proxy, ou l'ecriture est permise.
 */
export async function clientAgence() {
  const magasin = await cookies()

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    global: { fetch: fetchAgence },
    cookies: {
      getAll: () => magasin.getAll(),
      setAll: (aPoser) => {
        try {
          for (const { name, value, options } of aPoser) magasin.set(name, value, options)
        } catch {
          // Composant serveur : le proxy s'en charge.
        }
      },
    },
  })
}

/**
 * L'utilisateur connecte, ou rien.
 *
 * `getUser()` et jamais `getSession()`. La nuance est le point le plus facile
 * a manquer de toute cette PR : `getSession()` lit le cookie et le croit sur
 * parole, alors qu'un cookie est fourni par le client. `getUser()` demande a
 * Supabase de verifier le jeton. Utiliser le premier pour decider d'un acces
 * reviendrait a laisser l'appelant se declarer qui il veut.
 */
export async function utilisateurCourant() {
  const supabase = await clientAgence()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) return null
  return data.user
}
