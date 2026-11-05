export function lireDocage(
  valeur: unknown,
  identifiants: { courriel: string; cle: string },
  requete?: typeof fetch,
): Promise<{
  etat: 'draft' | 'approval' | 'ongoing' | 'paused' | 'declined' | 'canceled' | 'expired' | 'done'
  test: boolean
}>
