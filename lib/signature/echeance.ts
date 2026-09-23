/** Meme borne UTC que l'adaptateur, qui transmet uniquement YYYY-MM-DD. */
export function echeanceActe(expireDossier: string, maintenant = Date.now()): Date {
  const limite = Math.min(maintenant + 3 * 86400000, Date.parse(expireDossier) - 86400000)
  if (!Number.isFinite(limite)) throw new Error('Echeance indisponible')
  const expiration = new Date(new Date(limite).toISOString().slice(0, 10) + 'T00:00:00.000Z')
  if (expiration.getTime() < maintenant + 86400000)
    throw new Error('Delai de signature insuffisant')
  return expiration
}
