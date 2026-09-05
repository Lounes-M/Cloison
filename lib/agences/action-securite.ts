'use server'
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
  if (!/^[0-9]{6}$/.test(code) || !/^[0-9a-f-]{36}$/.test(facteur))
    return { ...etat, erreur: securite.erreur }
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId: facteur, code })
  if (error) return { ...etat, erreur: securite.erreur }
  redirect('/espace')
}
export async function seDeconnecter() {
  const db = await clientAgence()
  await db.auth.signOut()
  redirect('/connexion')
}
