import 'server-only'
/** Taille reelle bornee, meme sans Content-Length ; aucun corps dans les erreurs. */
export async function lireCorpsWebhook(requete: Request): Promise<string | null> {
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
