import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

import { env } from '@/lib/env'

/**
 * Le serveur, quand il agit pour lui-meme.
 *
 * Quatrieme role Postgres, apres `anon`, `authenticated` et `porteur_lien`.
 * Il ne correspond a aucune personne : c'est nous, quand un evenement Stripe
 * verifie nous dit qu'un dossier est regle. Il n'a aucun droit de table ;
 * une seule fonction lui est ouverte (migration 0018).
 *
 * Le jeton est signe avec le secret JWT du projet, comme ceux des porteurs de
 * lien : Supabase lit le claim `role` et fait prendre a la connexion le role
 * Postgres du meme nom. La barriere est le role, pas un secret partage entre
 * deux tables, et seule notre signature peut le faire exister.
 *
 * Cinq minutes de vie : le jeton sert a un appel, pas a une session.
 */
export async function clientServeur() {
  const jeton = await new SignJWT({ role: 'serveur' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(env.supabaseJwtSecret))

  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  })
}
