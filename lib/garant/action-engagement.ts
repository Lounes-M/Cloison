'use server'

import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { sessionPorteur } from '@/lib/content/session-porteur'

import { revalidatePath } from 'next/cache'

import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { prevenirSiLeStatutAChange, statutActuel } from '@/lib/courriels/notifications'
import { analyserEngagement } from '@/lib/garant/validation'
import { versionConditions } from '@/lib/garant/version-conditions'
import { conditionsEngagement } from '@/lib/content/conditions-engagement'

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
  for (const nom of ['couvre', 'montant', 'jusquAu', 'solidaire', 'revenu']) {
    const valeur = donnees.get(nom)
    champs[nom] = typeof valeur === 'string' ? valeur : undefined
  }

  const analyse = analyserEngagement(champs)
  if (!analyse.ok) return { statut: 'erreur', message: analyse.message }

  const porteur = await capaciteDepuisCookies()
  if (porteur && !formulaireDuDossier(donnees, porteur.capacite.dossierId)) {
    return { statut: 'erreur', message: sessionPorteur.autreDossier }
  }
  if (!porteur || porteur.capacite.partie !== 'garant') {
    return {
      statut: 'erreur',
      message: 'Ton lien a expire. Demande au locataire de te le renvoyer.',
    }
  }

  const version = versionConditions(donnees)
  if (version === null) return { statut: 'erreur', message: conditionsEngagement.perimees }
  const supabase = clientPorteurDeLien(porteur.jeton)
  const { dossierId } = porteur.capacite
  const colonnes = {
    couvre: analyse.engagement.couvre,
    montant_max_cents: analyse.engagement.montantMaxCents,
    jusqu_au: analyse.engagement.jusquAu,
    solidaire: analyse.engagement.solidaire,
    // Le ratio n'est pas ici, et ne le sera jamais : la base le calcule quand
    // cette colonne change, et `porteur_lien` n'a pas le droit de l'ecrire.
    revenu_net_mensuel_cents: analyse.engagement.revenuNetMensuelCents,
  }

  try {
    const { data: existant, error: erreurLecture } = await supabase
      .from('engagements')
      .select('dossier_id, version_conditions')
      .eq('dossier_id', dossierId)
      .maybeSingle()

    if (erreurLecture) throw new Error('Lecture indisponible')
    if (Number(existant?.version_conditions ?? 0) !== version) {
      return { statut: 'erreur', message: conditionsEngagement.perimees }
    }

    const avant = await statutActuel(supabase, dossierId)

    const ecriture = existant
      ? supabase
          .from('engagements')
          .update(colonnes)
          .eq('dossier_id', dossierId)
          .eq('version_conditions', version)
      : supabase.from('engagements').insert({ dossier_id: dossierId, ...colonnes })

    const { data: enregistre, error } = await ecriture.select('dossier_id').maybeSingle()

    if (error || !enregistre) {
      console.error('[garant] engagement refuse')
      return {
        statut: 'erreur',
        message: "L'enregistrement n'a pas abouti. Reessaie dans un instant.",
      }
    }

    // Le revenu declare est un des deux termes du ratio : la base a peut-etre
    // tranche a l'instant.
    await prevenirSiLeStatutAChange(supabase, dossierId, avant)
  } catch {
    console.error('[garant] engagement impossible')
    return {
      statut: 'erreur',
      message: "L'enregistrement n'a pas abouti. Reessaie dans un instant.",
    }
  }

  revalidatePath('/garant')
  return { statut: 'enregistre' }
}
