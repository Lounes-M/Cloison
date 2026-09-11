'use server'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { cookies } from 'next/headers'
import { estCookieAgence } from '@/lib/acces/cookies-agence'
import { redirect } from 'next/navigation'
import { clientAgence, utilisateurCourant } from '@/lib/acces/agence'
import { securite } from '@/lib/content/securite'

export type EtatSecurite = { facteur?: string; qr?: string; secret?: string; erreur?: string }
export async function verifierSecondFacteur(
  etat: EtatSecurite,
  donnees: FormData,
): Promise<EtatSecurite> {
  if (!(await utilisateurCourant())) redirect('/connexion')
  const db = await clientAgence()
  if (donnees.get('operation') === 'configurer') {
    const { data: facteurs, error: liste } = await db.auth.mfa.listFactors()
    if (liste) return { erreur: securite.erreur }
    const existant = facteurs.totp.find((f) => f.status === 'verified')
    if (existant) return { facteur: existant.id }
    for (const ancien of facteurs.all.filter(
      (f) => f.factor_type === 'totp' && f.status === 'unverified',
    )) {
      const { error } = await db.auth.mfa.unenroll({ factorId: ancien.id })
      if (error) return { erreur: securite.erreur }
    }
    const { data, error } = await db.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Cloison',
    })
    if (error) return { erreur: securite.erreur }
    return { facteur: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
  }
  const facteur = String(donnees.get('facteur') ?? '')
  const code = String(donnees.get('code') ?? '')
  if (!/^[0-9]{6}$/.test(code) || !estUuidCanonique(facteur))
    return { ...etat, erreur: securite.erreur }
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId: facteur, code })
  if (error) return { ...etat, facteur, erreur: securite.erreur }
  redirect('/espace')
}
export async function seDeconnecter() {
  try {
    const db = await clientAgence()
    const { error } = await db.auth.signOut({ scope: 'local' })
    if (error) console.error('[connexion] revocation distante non confirmee')
  } catch {
    console.error('[connexion] revocation distante non confirmee')
  }
  // Une panne du fournisseur ne doit pas conserver la session sur cet appareil.
  // Les autres projets et la capacite locataire/garant ne sont pas concernes.
  const magasin = await cookies()
  for (const { name } of magasin.getAll()) {
    if (estCookieAgence(name)) magasin.set(name, '', { path: '/', maxAge: 0, sameSite: 'lax' })
  }
  redirect('/connexion')
}
