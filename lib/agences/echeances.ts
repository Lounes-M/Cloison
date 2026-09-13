import 'server-only'

/** Bornes de lecture, jamais une autorisation : celle-ci reste imposee par SQL. */
export function bornesEcheance(horizon: '' | '7' | '30') {
  if (!horizon) return null
  const maintenant = Date.now()
  return {
    apres: new Date(maintenant).toISOString(),
    jusqua: new Date(maintenant + Number(horizon) * 86400000).toISOString(),
  }
}
