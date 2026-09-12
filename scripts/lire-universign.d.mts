export function lireUniversign(
  valeur: unknown,
  cleApi: string,
  requete?: typeof fetch,
): Promise<{ etat: 'draft' | 'started' | 'paused' | 'cancelled' | 'expired' | 'completed' }>
