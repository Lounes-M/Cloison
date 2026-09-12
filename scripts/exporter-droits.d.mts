export function exporterDroits(
  commande: string,
  decisionPath: string,
  source: string,
  destination: string,
  cle: Buffer,
): Promise<{ fichiers: number; sha256?: string }>
