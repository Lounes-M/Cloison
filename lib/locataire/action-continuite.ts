'use server'
import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { sessionPorteur as sessionPorteurFr } from '@/lib/content/session-porteur'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { clientServeur } from '@/lib/acces/serveur'
import { consommerDebit } from '@/lib/acces/debit'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { reprendreLivraisonLiens } from '@/lib/courriels/livraison-liens'
import { continuite as continuiteFr } from '@/lib/content/continuite'
import { prevenirSiLeStatutAChange } from '@/lib/courriels/notifications'
import { sessionPorteur as sessionPorteurEn } from '@/lib/content/en/session-porteur'
import { continuite as continuiteEn } from '@/lib/content/en/continuite'
import { choisir } from '@/lib/i18n'
import { langueAction } from '@/lib/langue-espace'
export type EtatContinuite = { message?: string }
export async function retrouverMonDossier(
  _etat: EtatContinuite,
  form: FormData,
): Promise<EtatContinuite> {
  const langue = await langueAction(form)
  const continuite = choisir(langue, continuiteFr, continuiteEn)

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
      await reprendreLivraisonLiens(d.dossier_id)
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
  const langue = await langueAction(form)
  const sessionPorteur = choisir(langue, sessionPorteurFr, sessionPorteurEn)
  const continuite = choisir(langue, continuiteFr, continuiteEn)

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
  await prevenirSiLeStatutAChange(db, porteur.capacite.dossierId, null)
  revalidatePath('/locataire')
  return { message: continuite.rattache }
}
