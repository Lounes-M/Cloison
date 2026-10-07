export function stockageRemise(
  valeur: unknown,
  requete?: typeof fetch,
): (id: string, archive: Buffer) => Promise<void>
