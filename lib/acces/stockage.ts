import 'server-only'
import { SignJWT } from 'jose'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { estUuidCanonique } from '@/lib/validation/uuid'
import type { Capacite } from './jeton'

/** Cette capacite de depot n'est jamais envoyee au navigateur. */
export type ProvenanceCopie = { source: Capacite; piece: string; empreinte: string }
export async function clientStockage(capacite: Capacite, copie?: ProvenanceCopie) {
  if (capacite.partie !== 'garant') throw new Error('Garant requis')
  if (
    copie &&
    (copie.source.partie !== 'garant' ||
      copie.source.dossierId === capacite.dossierId ||
      !estUuidCanonique(copie.source.dossierId) ||
      !estUuidCanonique(copie.source.jti) ||
      !estUuidCanonique(copie.piece) ||
      !/^[a-f0-9]{64}$/.test(copie.empreinte))
  )
    throw new Error('Copie non autorisee')
  const jeton = await new SignJWT({
    ...(copie
      ? {
          copie_version: 'copie-v1',
          copie_dossier: copie.source.dossierId,
          copie_jti: copie.source.jti,
          copie_piece: copie.piece,
          copie_empreinte: copie.empreinte,
        }
      : {}),
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
