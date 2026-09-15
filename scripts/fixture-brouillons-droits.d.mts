import type { BaseCollecte, decisionCollecte } from '../lib/droits/collecte'
import type { Trousseau } from '../lib/coffre/rotation-format'
import type { SaisieBrouillon } from '../lib/brouillons/format'
export function fixtureBrouillonsDroits(
  db: BaseCollecte,
  rotation?: boolean,
): Promise<{
  brut: string
  decision: ReturnType<typeof decisionCollecte>['decision']
  trousseau: Trousseau
  saisie: SaisieBrouillon
  dossier: string
  locataire: string
  revision: string
}>
