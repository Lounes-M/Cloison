import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

import { env } from '@/lib/env'

/**
 * Le serveur, quand il agit pour lui-meme.
 *
 * Quatrieme role Postgres, apres `anon`, `authenticated` et `porteur_lien`.
 * Il ne correspond a aucune personne : c'est nous. Ne avec la migration 0018
 * pour porter jusqu'a la base ce qu'un evenement Stripe verifie nous dit, il
 * tient depuis la 0019 tout ce que la cle publiable ne doit pas pouvoir faire
 * seule : ouvrir un dossier pour un locataire, emettre et verifier un jeton
 * de capacite, compter le debit. Il n'a aucun droit de table ; seules ces
 * fonctions lui sont ouvertes.
 *
 * Le jeton est signe avec le secret JWT du projet, comme ceux des porteurs de
 * lien : Supabase lit le claim `role` et fait prendre a la connexion le role
 * Postgres du meme nom. La barriere est le role, pas un secret partage entre
 * deux tables, et seule notre signature peut le faire exister. C'est ce qui
 * rend l'appel direct sur l'API PostgREST impossible plutot que borne : qui
 * n'a que la cle publiable ne porte que `anon`, et `anon` n'a plus rien.
 *
 * Cinq minutes de vie : le jeton sert a un appel, pas a une session.
 */
export async function clientServeur(signal?: AbortSignal) {
  const jeton = await new SignJWT({ role: 'serveur' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(env.supabaseJwtSecret))

  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${jeton}` },
      ...(signal
        ? {
            fetch: (input: RequestInfo | URL, options?: RequestInit) =>
              fetch(input, {
                ...options,
                signal: AbortSignal.any([
                  signal,
                  ...(options?.signal
                    ? [options.signal]
                    : input instanceof Request
                      ? [input.signal]
                      : []),
                ]),
              }),
          }
        : {}),
    },
  })
}
