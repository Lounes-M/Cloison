'use server'
import { redirect } from 'next/navigation'
import { clientAgence, utilisateurCourant } from '@/lib/acces/agence'
import { contexteApplicationSecours } from './application-secours'
import { codesSecoursActifs, lotCodes, statutCodes } from './codes-secours'
import { codesSecours as t } from '@/lib/content/codes-secours'
export type EtatCodesSecours = { message: string; codes?: string[] }
export async function gererCodesSecours(
  _etat: EtatCodesSecours,
  form: FormData,
): Promise<EtatCodesSecours> {
  try {
    if (!codesSecoursActifs()) return { message: t.indisponible }
    const c = await contexteApplicationSecours()
    if (!c) throw new Error()
    const ancien = await c.db.auth.mfa.recoveryCodes.getStatus()
    let reponse
    if (form.get('operation') === 'generer' && ancien.error?.code === 'mfa_factor_not_found') {
      reponse = await c.db.auth.mfa.recoveryCodes.generate({ friendlyName: 'Cloison récupération' })
    } else if (
      form.get('operation') === 'regenerer' &&
      !ancien.error &&
      form.get('accord') === 'on'
    ) {
      const actuel = statutCodes.parse(ancien.data)
      if (form.get('facteur') !== actuel.id) throw new Error()
      reponse = await c.db.auth.mfa.recoveryCodes.regenerate()
    } else throw new Error()
    if (reponse.error) throw new Error()
    const lot = lotCodes.parse(reponse.data)
    const verification = await c.db.auth.mfa.recoveryCodes.getStatus()
    const apres = statutCodes.parse(verification.data)
    if (
      verification.error ||
      apres.id !== lot.id ||
      apres.total !== lot.total ||
      apres.remaining !== lot.total
    )
      throw new Error()
    return { message: t.conserver, codes: lot.codes }
  } catch {
    return { message: t.erreur }
  }
}
export async function verifierCodeSecours(
  _etat: EtatCodesSecours,
  form: FormData,
): Promise<EtatCodesSecours> {
  let succes = false
  try {
    if (!codesSecoursActifs()) return { message: t.indisponible }
    const brut = form.get('code')
    if (typeof brut !== 'string' || brut.length > 128) return { message: t.invalide }
    const code = brut.replace(/[\s-]/g, '').toLowerCase()
    if (!/^[a-z0-9]{16,64}$/.test(code)) return { message: t.invalide }
    const user = await utilisateurCourant()
    if (!user) return { message: t.invalide }
    const db = await clientAgence()
    const niveau = await db.auth.mfa.getAuthenticatorAssuranceLevel()
    if (niveau.error || niveau.data?.currentLevel !== 'aal1') return { message: t.invalide }
    const r = await db.auth.mfa.recoveryCodes.verify({ code })
    if (r.error)
      return {
        message:
          r.error.code === 'mfa_recovery_codes_locked' || r.error.status === 429
            ? t.limite
            : t.invalide,
      }
    const [identite, assurance] = await Promise.all([
      db.auth.getUser(),
      db.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    if (
      identite.error ||
      identite.data.user?.id !== user.id ||
      assurance.error ||
      assurance.data?.currentLevel !== 'aal2'
    )
      throw new Error()
    const revocation = await db.rpc('revoquer_sessions_apres_recuperation')
    if (revocation.error || revocation.data !== true) throw new Error()
    const deconnexion = await db.auth.signOut({ scope: 'others' })
    if (deconnexion.error) throw new Error()
    succes = true
  } catch {
    return { message: t.erreur }
  }
  if (succes) redirect('/espace/securite')
  return { message: t.erreur }
}
