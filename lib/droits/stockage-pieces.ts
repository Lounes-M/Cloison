import { z } from 'zod'

const configuration = z.strictObject({
  projet: z.string().regex(/^[a-z]{20}$/),
  jeton: z
    .string()
    .min(20)
    .max(4096)
    .regex(/^[A-Za-z0-9_.-]+$/),
})

/** Origine Supabase fixe, aucune redirection ni URL provenant de la base. */
export function stockagePiecesDroits(valeur: unknown, requete: typeof fetch = fetch) {
  const c = configuration.parse(valeur)
  return async (chemin: string, taille: number, signal: AbortSignal): Promise<Buffer> => {
    let lecteur: ReadableStreamDefaultReader<Uint8Array> | undefined
    const blocs: Buffer[] = []
    try {
      if (
        !/^[a-f0-9-]{36}\/[A-Za-z0-9_-]{1,128}$/.test(chemin) ||
        !Number.isSafeInteger(taille) ||
        taille < 29 ||
        taille > 20 * 1024 * 1024 + 28
      )
        throw new Error()
      const reponse = await requete(
        `https://${c.projet}.supabase.co/storage/v1/object/pieces/${chemin}`,
        {
          headers: {
            apikey: c.jeton,
            Authorization: `Bearer ${c.jeton}`,
            'Accept-Encoding': 'identity',
          },
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        },
      )
      lecteur = reponse.body?.getReader()
      const longueur = reponse.headers.get('content-length')
      const encodage = reponse.headers.get('content-encoding')
      if (
        reponse.status !== 200 ||
        !lecteur ||
        (longueur !== null && longueur !== String(taille)) ||
        (encodage !== null && encodage !== 'identity')
      )
        throw new Error()
      let recu = 0
      for (;;) {
        const { done, value } = await lecteur.read()
        if (done) break
        recu += value.byteLength
        if (recu > taille) throw new Error()
        blocs.push(Buffer.from(value))
      }
      signal.throwIfAborted()
      if (recu !== taille) throw new Error()
      return Buffer.concat(blocs, recu)
    } catch {
      throw new Error('Lecture Storage refusee.')
    } finally {
      await lecteur?.cancel().catch(() => {})
      lecteur?.releaseLock()
      for (const bloc of blocs) bloc.fill(0)
    }
  }
}
