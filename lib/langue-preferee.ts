import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { clientServeur } from '@/lib/acces/serveur'
import type { Partie } from '@/lib/acces/jeton'
import { estLangue, type Langue } from '@/lib/i18n'

/**
 * La langue preferee, telle que la base la garde (migration 0083).
 *
 * Elle decide de la langue des courriels. Aucune de ces fonctions ne leve :
 * une preference qui ne s'enregistre pas ne doit pas faire echouer
 * l'ouverture d'un dossier ni l'envoi d'un lien. Le repli est le francais.
 */

/** Range la langue d'un locataire ou d'un garant sur son dossier. */
export async function reglerLangueDossier(
  dossierId: string,
  partie: Partie,
  langue: Langue,
  db?: SupabaseClient,
): Promise<boolean> {
  try {
    const { data, error } = await (db ?? (await clientServeur())).rpc('regler_langue_dossier', {
      le_dossier: dossierId,
      la_partie: partie,
      la_langue: langue,
    })
    return !error && data === true
  } catch {
    return false
  }
}

/** La langue choisie par un porteur, ou rien s'il n'a encore rien choisi. */
export async function langueDossier(dossierId: string, partie: Partie): Promise<Langue | null> {
  try {
    const { data, error } = await (
      await clientServeur()
    ).rpc('langue_dossier', { le_dossier: dossierId, la_partie: partie })
    return !error && estLangue(data) ? data : null
  } catch {
    return null
  }
}

/**
 * La langue de chaque destinataire d'un courriel. Une adresse absente de la
 * reponse, ou une base muette, valent le francais.
 */
export async function languesCourriels(
  db: SupabaseClient,
  dossierId: string | null,
  adresses: string[],
): Promise<(adresse: string) => Langue> {
  const connues = new Map<string, Langue>()
  try {
    if (adresses.length > 0) {
      const { data, error } = await db.rpc('langues_courriels', {
        le_dossier: dossierId,
        adresses: adresses.slice(0, 50),
      })
      if (!error && Array.isArray(data))
        for (const ligne of data)
          if (typeof ligne?.adresse === 'string' && estLangue(ligne.langue))
            connues.set(ligne.adresse.toLowerCase(), ligne.langue)
    }
  } catch {
    // Le repli est le francais.
  }
  return (adresse) => connues.get(adresse.toLowerCase()) ?? 'fr'
}
