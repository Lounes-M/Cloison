import { resultatOcr } from './resultat'

/** Corps borne aussi dans le navigateur ; le modele ne fournit jamais de HTML. */
export async function lireResultatOcr(
  reponse: Response,
  signal: AbortSignal,
  selection: number[] | null,
) {
  if (!reponse.ok || reponse.redirected || !reponse.body) throw new Error('Lecture indisponible')
  const attendues = selection ? [...selection] : null
  const lecteur = reponse.body.getReader(),
    blocs: Uint8Array[] = []
  let taille = 0
  const annuler = () => {
    void lecteur.cancel().catch(() => {})
  }
  signal.addEventListener('abort', annuler, { once: true })
  try {
    signal.throwIfAborted()
    while (true) {
      const { value, done } = await lecteur.read()
      signal.throwIfAborted()
      if (done) break
      taille += value.byteLength
      if (taille > 192 * 1024) throw new Error('Lecture indisponible')
      blocs.push(value)
    }
    const octets = new Uint8Array(taille)
    let offset = 0
    for (const bloc of blocs) {
      octets.set(bloc, offset)
      offset += bloc.byteLength
    }
    const resultat = resultatOcr.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets)),
    )
    if (
      (attendues && resultat.pages.length !== attendues.length) ||
      resultat.pages.some((p, i) => p.page !== (attendues ? attendues[i] : i + 1))
    )
      throw new Error('Lecture indisponible')
    return resultat
  } finally {
    signal.removeEventListener('abort', annuler)
    annuler()
    lecteur.releaseLock()
  }
}
