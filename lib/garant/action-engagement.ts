'use server'

import { traducteur } from '@/lib/messages'
import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { sessionPorteur as sessionPorteurFr } from '@/lib/content/session-porteur'

import { revalidatePath } from 'next/cache'

import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { prevenirSiLeStatutAChange, statutActuel } from '@/lib/courriels/notifications'
import { engagement as texteEngagementFr } from '@/lib/content/garant'
import { euros as eurosFr } from '@/lib/content/tarifs'
import { analyserEngagement, plafondSousLeLoyer } from '@/lib/garant/validation'
import { versionConditions } from '@/lib/garant/version-conditions'
import { conditionsEngagement as conditionsEngagementFr } from '@/lib/content/conditions-engagement'
import { sessionPorteur as sessionPorteurEn } from '@/lib/content/en/session-porteur'
import { engagement as texteEngagementEn } from '@/lib/content/en/garant'
import { euros as eurosEn } from '@/lib/content/en/tarifs'
import { conditionsEngagement as conditionsEngagementEn } from '@/lib/content/en/conditions-engagement'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

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
  | { statut: 'inactif' }
  | { statut: 'enregistre'; avertissement?: string }
  | { statut: 'erreur'; message: string }

export async function declarerMonEngagement(
  _precedent: EtatEngagement,
  donnees: FormData,
): Promise<EtatEngagement> {
  const langue = await langueEspace()
  const dire = traducteur(langue)
  const sessionPorteur = choisir(langue, sessionPorteurFr, sessionPorteurEn)
  const conditionsEngagement = choisir(langue, conditionsEngagementFr, conditionsEngagementEn)

  const champs: Record<string, string | undefined> = {}
  for (const nom of ['couvre', 'montant', 'jusquAu', 'solidaire', 'revenu', 'profil']) {
    const valeur = donnees.get(nom)
    champs[nom] = typeof valeur === 'string' ? valeur : undefined
  }

  const analyse = analyserEngagement(champs, new Date(), langue)
  if (!analyse.ok) return { statut: 'erreur', message: analyse.message }

  const porteur = await capaciteDepuisCookies()
  if (porteur && !formulaireDuDossier(donnees, porteur.capacite.dossierId)) {
    return { statut: 'erreur', message: sessionPorteur.autreDossier }
  }
  if (!porteur || porteur.capacite.partie !== 'garant') {
    return {
      statut: 'erreur',
      message: dire('Votre lien a expiré. Demandez au locataire de vous le renvoyer.'),
    }
  }

  const version = versionConditions(donnees)
  if (version === null) return { statut: 'erreur', message: conditionsEngagement.perimees }
  const supabase = clientPorteurDeLien(porteur.jeton)
  const { dossierId } = porteur.capacite
  const colonnes = {
    ...(analyse.engagement.profilRessources
      ? { profil_ressources: analyse.engagement.profilRessources }
      : {}),
    couvre: analyse.engagement.couvre,
    montant_max_cents: analyse.engagement.montantMaxCents,
    jusqu_au: analyse.engagement.jusquAu,
    solidaire: analyse.engagement.solidaire,
    // Le ratio n'est pas ici, et ne le sera jamais : la base le calcule quand
    // cette colonne change, et `porteur_lien` n'a pas le droit de l'ecrire.
    revenu_net_mensuel_cents: analyse.engagement.revenuNetMensuelCents,
  }

  let avertissement: string | undefined
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

    const { data: ligneLoyer } = await supabase
      .from('dossiers')
      .select('loyer_cents')
      .eq('id', dossierId)
      .maybeSingle()
    const loyerCents = ligneLoyer?.loyer_cents == null ? null : Number(ligneLoyer.loyer_cents)
    const texteEngagement = choisir(langue, texteEngagementFr, texteEngagementEn)
    // Le garant lit deja ce loyer : la politique « Un porteur de lien voit le
    // sien » lui ouvre la ligne, sans retrait de colonne.
    avertissement =
      plafondSousLeLoyer(analyse.engagement.montantMaxCents, loyerCents) &&
      loyerCents != null &&
      Number.isSafeInteger(loyerCents)
        ? texteEngagement.avertissementLoyer(choisir(langue, eurosFr, eurosEn)(loyerCents))
        : undefined

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
        message: dire("L'enregistrement n'a pas abouti. Réessayez dans un instant."),
      }
    }

    // Le revenu declare est un des deux termes du ratio : la base a peut-etre
    // tranche a l'instant.
    await prevenirSiLeStatutAChange(supabase, dossierId, avant)
  } catch {
    console.error('[garant] engagement impossible')
    return {
      statut: 'erreur',
      message: dire("L'enregistrement n'a pas abouti. Réessayez dans un instant."),
    }
  }

  revalidatePath('/garant')
  return avertissement ? { statut: 'enregistre', avertissement } : { statut: 'enregistre' }
}
