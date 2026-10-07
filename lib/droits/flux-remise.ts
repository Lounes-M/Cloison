import 'server-only'
import { createHash } from 'node:crypto'

/** Relais chiffre borne, sans exposer au navigateur une capacite Storage cacheable. */
export async function fluxRemise(url: string, taille: number, sha256: string, signal: AbortSignal) {
  const r = await fetch(url, {
    signal,
    redirect: 'error',
    cache: 'no-store',
    headers: { 'Accept-Encoding': 'identity' },
  })
  const lecteur = r.body?.getReader()
  if (
    r.status !== 200 ||
    !lecteur ||
    (r.headers.has('content-length') && r.headers.get('content-length') !== String(taille))
  ) {
    await lecteur?.cancel().catch(() => {})
    throw new Error('Paquet indisponible.')
  }
  let total = 0
  const hash = createHash('sha256')
  return new ReadableStream<Uint8Array>({
    async pull(controleur) {
      try {
        signal.throwIfAborted()
        const { value, done } = await lecteur.read()
        signal.throwIfAborted()
        if (done) {
          if (total !== taille || hash.digest('hex') !== sha256) throw new Error()
          lecteur.releaseLock()
          controleur.close()
          return
        }
        total += value.length
        if (total > taille) throw new Error()
        hash.update(value)
        controleur.enqueue(value)
      } catch {
        await lecteur.cancel().catch(() => {})
        lecteur.releaseLock()
        controleur.error(new Error('Paquet indisponible.'))
      }
    },
    async cancel() {
      await lecteur.cancel().catch(() => {})
      lecteur.releaseLock()
    },
  })
}
