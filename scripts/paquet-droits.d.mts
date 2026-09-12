export type DecisionPaquet = {
  version: 1
  demande: string
  revision: string
  decisionSha256: string
  destinataireSha256: string
  creeLe: string
  expireLe: string
  exclusions: string[]
  fichiers: { nom: string; taille: number; sha256: string }[]
}
export function verifierDecisionPaquet(valeur: unknown, maintenant?: number): DecisionPaquet
export function creerPaquetDroits(
  valeur: unknown,
  fichiers: Map<string, Buffer>,
  cle: Buffer,
  maintenant?: number,
): Buffer
export function ouvrirPaquetDroits(
  archive: Buffer,
  cle: Buffer,
  attendue: unknown,
  maintenant?: number,
): { decision: DecisionPaquet; fichiers: Map<string, Buffer> }
