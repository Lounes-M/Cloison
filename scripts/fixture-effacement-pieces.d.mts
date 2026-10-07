import type { BaseCollecte } from '../lib/droits/collecte'
import type { preparerEffacementPieces } from '../lib/droits/effacement-pieces'
export function fixtureEffacementPieces(db: BaseCollecte): Promise<{
  brut: string
  decision: Awaited<ReturnType<typeof preparerEffacementPieces>>
  projet: unknown
  piece: { id: string; chemin: string }
  garant: string
  locataire: string
  etranger: string
}>
