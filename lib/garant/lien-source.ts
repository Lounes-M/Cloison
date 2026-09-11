import { site } from '@/lib/site'

/** Aucun appel HTTP : seule une URL du site configure est acceptee. */
export function jetonDuLienSource(valeur: unknown): string | null {
  if (typeof valeur !== 'string' || valeur.length > 4096) return null
  try {
    const url = new URL(valeur.trim())
    if (
      url.origin !== new URL(site.url).origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null
    const correspondance = /^\/lien\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\/?$/.exec(
      url.pathname,
    )
    return correspondance?.[1] ?? null
  } catch {
    return null
  }
}
