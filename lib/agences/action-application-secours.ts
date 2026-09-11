'use server'
import { revalidatePath } from 'next/cache'
import { contexteApplicationSecours, NOM_SECOURS } from './application-secours'
import { applicationSecours as t } from '@/lib/content/application-secours'
import { estUuidCanonique } from '@/lib/validation/uuid'

export type EtatApplicationSecours = {
  facteur?: string
  qr?: string
  secret?: string
  erreur?: string
  succes?: boolean
}

export async function gererApplicationSecours(
  _etat: EtatApplicationSecours,
  donnees: FormData,
): Promise<EtatApplicationSecours> {
  try {
    const c = await contexteApplicationSecours()
    if (!c) return { erreur: t.erreur }
    const operation = donnees.get('operation')
    if (operation === 'preparer') {
      if (c.verifies.length >= 2 || c.attente) return { erreur: t.erreur }
      const { data, error } = await c.db.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: NOM_SECOURS,
      })
      if (error || !data) return { erreur: t.erreur }
      return { facteur: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
    }
    const facteur = String(donnees.get('facteur') ?? '')
    if (!estUuidCanonique(facteur) || facteur !== c.attente?.id) return { erreur: t.erreur }
    if (operation === 'annuler') {
      const { error } = await c.db.auth.mfa.unenroll({ factorId: facteur })
      if (error) return { erreur: t.erreur }
      revalidatePath('/espace/securite')
      return {}
    }
    if (operation !== 'verifier') return { erreur: t.erreur }
    const code = String(donnees.get('code') ?? '')
    if (!/^[0-9]{6}$/.test(code)) return { facteur, erreur: t.codeInvalide }
    const { error } = await c.db.auth.mfa.challengeAndVerify({ factorId: facteur, code })
    if (error) return { facteur, erreur: t.codeInvalide }
    revalidatePath('/espace/securite')
    return { succes: true }
  } catch {
    return { erreur: t.erreur }
  }
}
