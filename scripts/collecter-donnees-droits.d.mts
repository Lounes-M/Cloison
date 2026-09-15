export function ecrireCollecteDroits(
  decisionPath: string,
  destination: string,
  collecter: (brut: string) => Promise<unknown>,
  verifier: (brut: string) => Promise<void>,
): Promise<{ taille: number; sha256: string }>
