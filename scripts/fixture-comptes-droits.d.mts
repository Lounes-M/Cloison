import type { BaseCollecte, decisionCollecte } from '../lib/droits/collecte'
export function fixtureComptesDroits(
  db: BaseCollecte,
  nature?: string,
): Promise<{
  compte: string
  tiers: string
  agence: string
  brut: string
  decision: ReturnType<typeof decisionCollecte>['decision']
}>
