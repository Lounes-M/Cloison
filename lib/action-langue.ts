'use server'

import { clientAgence } from '@/lib/acces/agence'
import { capaciteDepuisCookies } from '@/lib/acces/session'
import { versLangue } from '@/lib/i18n'
import { poserLangue } from '@/lib/langue-espace'
import { reglerLangueDossier } from '@/lib/langue-preferee'

/**
 * La bascule de langue des espaces connectes.
 *
 * Deux effets. Le cookie change l'affichage tout de suite. La preference
 * enregistree change la langue des prochains courriels : sur le dossier pour
 * un locataire ou un garant, sur son compte pour un collaborateur d'agence.
 * Si la preference ne s'enregistre pas, l'affichage change quand meme.
 */
export async function changerLangue(donnees: FormData): Promise<void> {
  const langue = versLangue(donnees.get('langue'))
  await poserLangue(langue)
  try {
    const porteur = await capaciteDepuisCookies()
    if (porteur)
      await reglerLangueDossier(porteur.capacite.dossierId, porteur.capacite.partie, langue)
  } catch {
    // L'affichage a deja change.
  }
  try {
    await (await clientAgence()).rpc('regler_ma_langue', { la_langue: langue })
  } catch {
    // Pas de session agence, ou base indisponible.
  }
}
