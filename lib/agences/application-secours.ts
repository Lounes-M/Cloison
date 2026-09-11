import 'server-only'
import { clientAgence, utilisateurCourant } from '@/lib/acces/agence'

export const NOM_SECOURS = 'Cloison secours'

export async function contexteApplicationSecours() {
  if (!(await utilisateurCourant())) return null
  const db = await clientAgence()
  const niveau = await db.auth.mfa.getAuthenticatorAssuranceLevel()
  if (niveau.error || niveau.data?.currentLevel !== 'aal2') return null
  const liste = await db.auth.mfa.listFactors()
  if (liste.error || !liste.data) return null
  const verifies = liste.data.totp.filter((f) => f.status === 'verified')
  if (!verifies.length) return null
  const attente = liste.data.all.find(
    (f) => f.factor_type === 'totp' && f.status === 'unverified' && f.friendly_name === NOM_SECOURS,
  )
  return { db, verifies, attente }
}
