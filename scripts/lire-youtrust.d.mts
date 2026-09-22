export function lireYoutrust(
  valeur: unknown,
  cleApi: string,
  requete?: typeof fetch,
): Promise<{
  etat:
    | 'draft'
    | 'approval'
    | 'ongoing'
    | 'paused'
    | 'rejected'
    | 'declined'
    | 'canceled'
    | 'expired'
    | 'deleted'
    | 'done'
}>
