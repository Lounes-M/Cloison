import type { collecterPiecesDroits } from '../lib/droits/pieces'
export function ecrirePiecesDroits(
  decisionPath: string,
  destination: string,
  collecter: (brut: string) => ReturnType<typeof collecterPiecesDroits>,
): Promise<{ nombre: number; sha256: string }>
