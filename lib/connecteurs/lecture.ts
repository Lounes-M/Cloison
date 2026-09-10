import 'server-only'
import { z } from 'zod'
import { clientServeur } from '@/lib/acces/serveur'
import { empreinteConnecteur } from './cles'
const reference = z.string().min(8).max(32)
const page = z
  .object({
    version: z.literal(1),
    dossiers: z
      .array(
        z
          .object({ reference, etat: z.enum(['a_completer', 'pret', 'en_cours', 'signe', 'clos']) })
          .strict(),
      )
      .max(50),
    suite: reference.nullable(),
  })
  .strict()
const repondre = (status: number, corps: unknown) =>
  Response.json(corps, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(status === 429 ? { 'Retry-After': '60' } : {}),
      ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}),
    },
  })
export async function lireStatuts(requete: Request) {
  const autorisation = requete.headers.get('authorization') ?? ''
  const empreinte = autorisation.startsWith('Bearer ')
    ? empreinteConnecteur(autorisation.slice(7))
    : null
  if (!empreinte) return repondre(401, { erreur: 'non_autorise' })
  const params = new URL(requete.url).searchParams
  if ([...params.keys()].some((k) => k !== 'apres') || params.getAll('apres').length > 1)
    return repondre(400, { erreur: 'parametres_invalides' })
  const apres = params.get('apres')
  if (apres !== null && !reference.safeParse(apres).success)
    return repondre(400, { erreur: 'parametres_invalides' })
  try {
    const signal = AbortSignal.any([requete.signal, AbortSignal.timeout(5000)])
    const db = await clientServeur(signal)
    const { data, error } = await db.rpc('lire_statuts_connecteur', {
      l_empreinte: empreinte,
      apres,
    })
    if (error) return repondre(503, { erreur: 'indisponible' })
    if (data === null) return repondre(401, { erreur: 'non_autorise' })
    if (
      z
        .object({ limite: z.literal(true) })
        .strict()
        .safeParse(data).success
    )
      return repondre(429, { erreur: 'limite_atteinte' })
    const resultat = page.safeParse(data)
    if (!resultat.success) return repondre(503, { erreur: 'indisponible' })
    return repondre(200, resultat.data)
  } catch {
    return repondre(503, { erreur: 'indisponible' })
  }
}
