import 'server-only'
import { SignJWT } from 'jose'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { fetchBorne } from '@/lib/http/fetch-borne'
import { referenceFichierActe, type FichierActe } from './archive-format'

export async function stockageActe(reference: FichierActe, signal: AbortSignal) {
  const f = referenceFichierActe.parse(reference)
  const jeton = await new SignJWT({ role: 'archive_signature', fichier_signature: f.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(env.supabaseJwtSecret))
  const client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${jeton}` },
      fetch: (input: RequestInfo | URL, options?: RequestInit) =>
        fetchBorne(input, options, signal),
    },
  })
  const chemin = `${f.acte_id}/${f.id}`
  return {
    async deposer(chiffre: Buffer) {
      if (chiffre.length !== f.taille + 16) throw new Error('Archive invalide')
      const { error } = await client.storage
        .from('actes')
        .upload(chemin, chiffre, { upsert: false, contentType: 'application/octet-stream' })
      // Une reponse perdue ou une collision ne devient jamais un ecrasement.
      return !error
    },
    async lire() {
      signal.throwIfAborted()
      const reponse = await fetchBorne(
        `${env.supabaseUrl}/storage/v1/object/authenticated/actes/${chemin}`,
        {
          headers: { apikey: env.supabasePublishableKey, Authorization: `Bearer ${jeton}` },
          redirect: 'error',
          cache: 'no-store',
        },
        signal,
      )
      const attendu = f.taille + 16
      if (!reponse.ok || !reponse.body) {
        await reponse.body?.cancel()
        throw new Error('Archive indisponible')
      }
      const lecteur = reponse.body.getReader()
      const resultat = Buffer.alloc(attendu)
      let taille = 0
      try {
        while (true) {
          signal.throwIfAborted()
          const { done, value } = await lecteur.read()
          if (done) break
          if (taille + value.length > attendu) throw new Error('Archive invalide')
          resultat.set(value, taille)
          taille += value.length
        }
        if (taille !== attendu) throw new Error('Archive invalide')
        return resultat
      } catch (erreur) {
        resultat.fill(0)
        throw erreur
      } finally {
        await lecteur.cancel().catch(() => undefined)
        lecteur.releaseLock()
      }
    },
  }
}
