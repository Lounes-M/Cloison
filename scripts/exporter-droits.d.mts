import type { DecisionPaquet } from './paquet-droits.mjs'
export function exporterDroits(
  commande: string,
  decisionPath: string,
  source: string,
  destination: string,
  cle: Buffer,
  verifierSuivi?: (decision: DecisionPaquet, approbation: string) => Promise<void>,
): Promise<{ fichiers: number; sha256?: string }>
