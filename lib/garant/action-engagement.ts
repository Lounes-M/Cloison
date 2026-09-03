'use server'

import { revalidatePath } from 'next/cache'

import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { analyserEngagement } from '@/lib/garant/validation'

/**
 * Ce que le garant couvre.
 *
 * Il ecrit quatre colonnes d'`engagements`, et seulement celles-la : la
 * migration 0003 accorde `insert` et `update (couvre, montant_max_cents,
 * jusqu_au, solidaire)` a `porteur_lien`. Le ratio, lui, est calcule et jamais
 * saisi ; il n'apparait nulle part ici.
 *
 * Insertion ou mise a jour explicites plutot qu'un `upsert` : un `upsert`
 * reecrit toutes les colonnes envoyees en cas de conflit, cle primaire
 * comprise, et `porteur_lien` n'a pas le droit d'ecrire `dossier_id`. La
 * requete echouerait a la deuxieme sauvegarde, pas a la premiere : le genre
 * d'erreur qui passe les tests et casse en production.
 */

export type EtatEngagement =
  { statut: 'inactif' } | { statut: 'enregistre' } | { statut: 'erreur'; message: string }

export async function declarerMonEngagement(
  _precedent: EtatEngagement,
  donnees: FormData,
): Promise<EtatEngagement> {
  const champs: Record<string, string | undefined> = {}
  for (const nom of ['couvre', 'montant', 'jusquAu', 'solidaire']) {
    const valeur = donnees.get(nom)
    champs[nom] = typeof valeur === 'string' ? valeur : undefined
  }

  const analyse = analyserEngagement(champs)
  if (!analyse.ok) return { statut: 'erreur', message: analyse.message }

  const porteur = await capaciteDepuisCookies()
  if (!porteur || porteur.capacite.partie !== 'garant') {
    return {
      statut: 'erreur',
      message: 'Ton lien a expire. Demande au locataire de te le renvoyer.',
    }
  }

  const supabase = clientPorteurDeLien(porteur.jeton)
  const { dossierId } = porteur.capacite
  const colonnes = {
    couvre: analyse.engagement.couvre,
    montant_max_cents: analyse.engagement.montantMaxCents,
    jusqu_au: analyse.engagement.jusquAu,
    solidaire: analyse.engagement.solidaire,
  }

  try {
    const { data: existant } = await supabase
      .from('engagements')
      .select('dossier_id')
      .eq('dossier_id', dossierId)
      .maybeSingle()

    const { error } = existant
      ? await supabase.from('engagements').update(colonnes).eq('dossier_id', dossierId)
      : await supabase.from('engagements').insert({ dossier_id: dossierId, ...colonnes })

    if (error) {
      console.error('[garant] engagement refuse', error)
      return {
        statut: 'erreur',
        message: "L'enregistrement n'a pas abouti. Reessaie dans un instant.",
      }
    }
  } catch (erreur) {
    console.error('[garant] engagement impossible', erreur)
    return {
      statut: 'erreur',
      message: "L'enregistrement n'a pas abouti. Reessaie dans un instant.",
    }
  }

  revalidatePath('/garant')
  return { statut: 'enregistre' }
}
