/** Lecture des petits rapports operateur : 64 Kio, dans le delai de la requete. */
export async function lireJsonBorne(reponse, signal) {
  let lecteur
  const annuler = () => {
    void (lecteur ? lecteur.cancel() : reponse.body?.cancel())?.catch(() => {})
  }
  try {
    const longueur = reponse.headers.get('content-length')
    if (
      reponse.redirected ||
      !reponse.body ||
      (longueur !== null && (!/^\d+$/.test(longueur) || Number(longueur) > 65536))
    )
      throw new Error()
    lecteur = reponse.body.getReader()
    signal.addEventListener('abort', annuler, { once: true })
    const blocs = []
    let taille = 0
    signal.throwIfAborted()
    for (;;) {
      const { value, done } = await lecteur.read()
      signal.throwIfAborted()
      if (done) break
      taille += value.byteLength
      if (taille > 65536) throw new Error()
      blocs.push(value)
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(blocs, taille)),
    )
  } catch {
    throw new Error('Reponse JSON indisponible ou invalide')
  } finally {
    signal.removeEventListener('abort', annuler)
    annuler()
    lecteur?.releaseLock()
  }
}
