import 'server-only'
/** Taille reelle bornee, meme sans Content-Length ; aucun corps dans les erreurs. */
export async function lireCorpsWebhook(requete: Request): Promise<string | null> {
  const corps = await lireOctetsWebhook(requete)
  return corps === null ? null : corps.toString('utf8')
}

/** Pour les signatures portant sur les octets exacts, sans conversion UTF-8. */
export async function lireOctetsWebhook(requete: Request): Promise<Buffer | null> {
  if (Number(requete.headers.get('content-length')) > 65536) {
    // Le refus ne depend pas du nettoyage d'un flux fourni par le client.
    void requete.body?.cancel().catch(() => {})
    return null
  }
  if (!requete.body) return Buffer.alloc(0)
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
        annuler()
        return null
      }
      blocs.push(value)
    }
    return Buffer.concat(blocs, taille)
  } finally {
    signal.removeEventListener('abort', annuler)
    lecteur.releaseLock()
  }
}
