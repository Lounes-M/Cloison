import 'server-only'
import { SignJWT } from 'jose'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import type { Capacite } from './jeton'

/** Cette capacite de depot n'est jamais envoyee au navigateur. */
export async function clientStockage(capacite: Capacite) {
  if (capacite.partie !== 'garant') throw new Error('Garant requis')
  const jeton = await new SignJWT({
    role: 'depot_piece',
    dossier_id: capacite.dossierId,
    role_partie: 'garant',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(capacite.jti)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(env.supabaseJwtSecret))
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  })
}
