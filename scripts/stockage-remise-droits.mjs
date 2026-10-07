import { createHash } from 'node:crypto'
import { z } from 'zod'
const hash = (b) => createHash('sha256').update(b).digest('hex')
export function stockageRemise(valeur, requete = fetch) {
  const c = z
    .strictObject({
      projet: z.string().regex(/^[a-z]{20}$/),
      jeton: z
        .string()
        .min(20)
        .max(4096)
        .regex(/^[A-Za-z0-9_.-]+$/),
    })
    .parse(valeur)
  return async (id, archive) => {
    z.uuid().parse(id)
    if (!Buffer.isBuffer(archive) || archive.length < 29 || archive.length > 90 * 1024 * 1024)
      throw new Error('Paquet refuse.')
    const url = `https://${c.projet}.supabase.co/storage/v1/object/exports-droits/${id}`
    const headers = { apikey: c.jeton, Authorization: `Bearer ${c.jeton}` }
    const signal = AbortSignal.timeout(60000)
    // Une reponse perdue n'autorise jamais l'ecrasement d'un objet existant.
    try {
      const r = await requete(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/octet-stream',
          'x-upsert': 'false',
          'cache-control': 'no-store',
        },
        body: archive,
        redirect: 'error',
        signal,
      })
      await r.body?.cancel()
    } catch {
      /* La lecture exacte tranche les collisions et les reponses perdues. */
    }
    let lecteur
    try {
      const r = await requete(url, { headers, cache: 'no-store', redirect: 'error', signal })
      lecteur = r.body?.getReader()
      if (
        r.status !== 200 ||
        !lecteur ||
        (r.headers.has('content-length') &&
          r.headers.get('content-length') !== String(archive.length))
      )
        throw new Error()
      const empreinte = createHash('sha256')
      let n = 0
      for (;;) {
        const { value, done } = await lecteur.read()
        if (done) break
        n += value.length
        if (n > archive.length) throw new Error()
        empreinte.update(value)
      }
      if (n !== archive.length || empreinte.digest('hex') !== hash(archive)) throw new Error()
    } catch {
      throw new Error('Ecriture Storage non confirmee.')
    } finally {
      await lecteur?.cancel().catch(() => {})
      lecteur?.releaseLock()
    }
  }
}
