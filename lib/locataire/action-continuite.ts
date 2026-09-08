'use server'
import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { sessionPorteur } from '@/lib/content/session-porteur'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { clientServeur } from '@/lib/acces/serveur'
import { consommerDebit } from '@/lib/acces/debit'
import { capaciteDepuisCookies, clientPorteurDeLien, urlDuLien } from '@/lib/acces/session'
import { signerJeton } from '@/lib/acces/jeton'
import { envoyerLienLocataire } from '@/lib/courriels/liens'
import { continuite } from '@/lib/content/continuite'
export type EtatContinuite = { message?: string }
export async function retrouverMonDossier(
  _etat: EtatContinuite,
  form: FormData,
): Promise<EtatContinuite> {
  const email = z.email().safeParse(
    String(form.get('email') ?? '')
      .trim()
      .toLowerCase(),
  )
  const reference = String(form.get('reference') ?? '').trim()
  const resultat = { message: continuite.resultat }
  if (!email.success || !reference || reference.length > 100) return resultat
  try {
    const db = await clientServeur()
    const entetes = await headers()
    const ip = entetes.get('x-forwarded-for')?.split(',')[0]?.trim() || 'inconnu'
    if (
      !(await consommerDebit(db, 'lien_locataire', ip)) ||
      !(await consommerDebit(db, 'lien_locataire', email.data))
    )
      return resultat
    const { data, error } = await db.rpc('retrouver_lien_locataire', {
      courriel: email.data,
      reference_dossier: reference,
    })
    const d = Array.isArray(data) ? data[0] : null
    if (!error && d) {
      const jeton = await signerJeton(d.dossier_id, 'locataire', d.jti, new Date(d.expire_le))
      await envoyerLienLocataire({ a: email.data, url: urlDuLien(jeton), reference: d.reference })
    }
  } catch {
    console.error('[continuite] recuperation indisponible')
  }
  return resultat
}
export async function rattacherMonDossier(
  _etat: EtatContinuite,
  form: FormData,
): Promise<EtatContinuite> {
  const porteur = await capaciteDepuisCookies()
  if (porteur && !formulaireDuDossier(form, porteur.capacite.dossierId)) {
    return { message: sessionPorteur.autreDossier }
  }
  const domaine = String(form.get('domaine') ?? '')
    .trim()
    .toLowerCase()
  if (
    !porteur ||
    porteur.capacite.partie !== 'locataire' ||
    form.get('accord') !== 'on' ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domaine)
  )
    return { message: continuite.erreur }
  const db = clientPorteurDeLien(porteur.jeton)
  const { error } = await db.rpc('rattacher_mon_dossier', { domaine_agence: domaine })
  if (error) return { message: continuite.erreur }
  revalidatePath('/locataire')
  return { message: continuite.rattache }
}
