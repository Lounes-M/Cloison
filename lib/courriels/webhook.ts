import 'server-only'
import { z } from 'zod'
const NATURES = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.failed',
  'email.complained',
  'email.suppressed',
] as const
const reference = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const evenement = z.object({
  type: z.enum(NATURES),
  created_at: z.string().datetime({ offset: true }),
  data: z.object({ email_id: reference, tags: z.record(z.string(), z.string()).optional() }),
})
/** Recu uniquement apres verification cryptographique du corps brut. */
export function extraireEvenementCourriel(valeur: unknown, id: string) {
  if (
    valeur &&
    typeof valeur === 'object' &&
    'type' in valeur &&
    typeof valeur.type === 'string' &&
    !NATURES.includes(valeur.type as (typeof NATURES)[number])
  )
    return null
  const lu = evenement.parse(valeur)
  const tag = lu.data.tags?.cloison_id
  return {
    evenement: reference.parse(id),
    reference_fournisseur: lu.data.email_id,
    identifiant: tag === undefined ? null : z.uuid().parse(tag),
    nature: lu.type,
    survenu: lu.created_at,
  }
}
/** Taille reelle bornee, meme sans Content-Length ; aucun corps dans les erreurs. */
export async function lireCorpsCourriel(requete: Request): Promise<string | null> {
  if (Number(requete.headers.get('content-length')) > 65536) return null
  if (!requete.body) return ''
  const lecteur = requete.body.getReader(),
    signal = AbortSignal.any([requete.signal, AbortSignal.timeout(10000)])
  const annuler = () => {
    void lecteur.cancel().catch(() => {})
  }
  signal.addEventListener('abort', annuler, { once: true })
  const blocs: Uint8Array[] = []
  let taille = 0
  try {
    signal.throwIfAborted()
    while (true) {
      const { value, done } = await lecteur.read()
      signal.throwIfAborted()
      if (done) break
      taille += value.byteLength
      if (taille > 65536) {
        await lecteur.cancel()
        return null
      }
      blocs.push(value)
    }
    return Buffer.concat(blocs, taille).toString('utf8')
  } finally {
    signal.removeEventListener('abort', annuler)
    lecteur.releaseLock()
  }
}
