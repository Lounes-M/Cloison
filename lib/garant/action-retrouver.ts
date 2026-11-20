'use server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { clientServeur } from '@/lib/acces/serveur'
import { consommerDebit } from '@/lib/acces/debit'
import { reprendreLivraisonLiens } from '@/lib/courriels/livraison-liens'
import { continuite as continuiteFr } from '@/lib/content/continuite'
import { continuite as continuiteEn } from '@/lib/content/en/continuite'
import { choisir } from '@/lib/i18n'
import { langueAction } from '@/lib/langue-espace'

export type EtatRetrouverGarant = { message?: string }

/**
 * Le garant redemande son lien. La reponse est la meme que l'adresse soit
 * connue ou non : elle n'apprend rien a qui essaie des couples adresse et
 * reference. Le lien part a l'adresse du dossier, par la file habituelle.
 */
export async function retrouverMonLienGarant(
  _etat: EtatRetrouverGarant,
  form: FormData,
): Promise<EtatRetrouverGarant> {
  const langue = await langueAction(form)
  const continuite = choisir(langue, continuiteFr, continuiteEn)

  const email = z.email().safeParse(
    String(form.get('email') ?? '')
      .trim()
      .toLowerCase(),
  )
  const reference = String(form.get('reference') ?? '').trim()
  const resultat = { message: continuite.garant.resultat }
  if (!email.success || !reference || reference.length > 100) return resultat
  try {
    const db = await clientServeur()
    const entetes = await headers()
    const ip = entetes.get('x-forwarded-for')?.split(',')[0]?.trim() || 'inconnu'
    if (
      !(await consommerDebit(db, 'lien_garant', ip)) ||
      !(await consommerDebit(db, 'lien_garant', email.data))
    )
      return resultat
    const { data, error } = await db.rpc('retrouver_lien_garant', {
      courriel: email.data,
      reference_dossier: reference,
    })
    const d = Array.isArray(data) ? data[0] : null
    if (!error && d) await reprendreLivraisonLiens(d.dossier_id)
  } catch {
    console.error('[continuite] recuperation garant indisponible')
  }
  return resultat
}
