import 'server-only'

import { Resend } from 'resend'

import { env } from '@/lib/env'

/**
 * L'envoi d'un courriel, et rien d'autre.
 *
 * Du texte, jamais de HTML : un courriel qui porte un lien ou une nouvelle a
 * beaucoup a perdre a une mise en page, et rien a y gagner.
 *
 * Ne leve jamais. Un envoi rate se voit dans les journaux et dans la valeur de
 * retour ; il ne doit pas transformer une ecriture reussie en erreur affichee.
 */
export async function envoyer(
  a: string | string[],
  sujet: string,
  texte: string,
): Promise<boolean> {
  const destinataires = Array.isArray(a) ? a.filter(Boolean) : [a]
  if (destinataires.length === 0) return false

  try {
    const { error } = await new Resend(env.resendApiKey).emails.send({
      from: env.emailExpediteur,
      to: destinataires,
      subject: sujet,
      text: texte,
    })

    if (error) {
      console.error('[courriel] envoi refuse', sujet, error)
      return false
    }

    return true
  } catch (erreur) {
    console.error('[courriel] envoi impossible', sujet, erreur)
    return false
  }
}

/** L'adresse publique du site, normalisee par `next.config.ts`. */
export function adresseDuSite(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}
