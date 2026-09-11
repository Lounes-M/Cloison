'use server'
import { contexteApplicationSecours } from './application-secours'
import { applicationSecours as t } from '@/lib/content/application-secours'
import { estUuidCanonique } from '@/lib/validation/uuid'

export type EtatTestApplication = { erreur?: string; succes?: boolean }

export async function testerApplication(
  _etat: EtatTestApplication,
  donnees: FormData,
): Promise<EtatTestApplication> {
  const facteur = String(donnees.get('facteur') ?? '')
  const code = String(donnees.get('code') ?? '')
  if (!estUuidCanonique(facteur) || !/^[0-9]{6}$/.test(code)) return { erreur: t.codeInvalide }
  try {
    const c = await contexteApplicationSecours()
    if (!c || !c.verifies.some((f) => f.id === facteur)) return { erreur: t.erreur }
    const resultat = await c.db.auth.mfa.challengeAndVerify({ factorId: facteur, code })
    if (resultat.error) return { erreur: t.codeInvalide }
    const apres = await contexteApplicationSecours()
    if (!apres || !apres.verifies.some((f) => f.id === facteur)) return { erreur: t.incertain }
    return { succes: true }
  } catch {
    return { erreur: t.erreur }
  }
}
