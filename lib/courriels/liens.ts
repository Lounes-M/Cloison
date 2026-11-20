import 'server-only'

import { adresseDuSite, envoyer } from './envoi'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gabaritCourriel as gabaritEn } from '@/lib/content/en/gabarit-courriel'
import { liens as liensEn } from '@/lib/content/en/liens'
import { gabaritCourriel as gabaritFr } from '@/lib/content/gabarit-courriel'
import { liens as liensFr } from '@/lib/content/liens'
import { choisir, locale, type Langue } from '@/lib/i18n'
import { composerCourriel } from './gabarit'

/**
 * Les courriels qui portent un lien.
 *
 * L'e-mail n'est qu'un canal de livraison : ce qui autorise, c'est le jeton
 * dans le lien, jamais l'adresse (ADR 0006). Ces fonctions ne savent donc rien
 * du dossier au-dela de ce qu'il faut ecrire dans le message.
 *
 * Deux versions, texte et HTML, qui disent la meme chose. Le HTML reste
 * sobre : un seul lien, repete en clair sous le bouton, aucune image et rien
 * de charge a l'ouverture. C'est ce qu'un filtre anti-hameconnage attend d'un
 * courriel legitime qui porte un lien.
 *
 * Chaque courriel part dans la langue de son destinataire (migration 0083).
 *
 * Aucune de ces fonctions ne leve. Un envoi rate se voit dans les journaux et
 * dans la valeur de retour ; il ne doit pas transformer un dossier bien ouvert
 * en erreur de serveur.
 */

/** Ce que le courriel montre du dossier : sa reference, rien d'autre. */
type Livraison = { db: SupabaseClient; id: string; signal?: AbortSignal; differer: boolean }
type Envoi = {
  a: string
  url: string
  reference: string
  expireLe?: Date
  livraison?: Livraison
  langue?: Langue
}

function validite(langue: Langue, date?: Date) {
  const liens = choisir(langue, liensFr, liensEn)
  return date
    ? liens.fin(
        date.toLocaleString(locale(langue), {
          timeZone: 'Europe/Paris',
          dateStyle: 'long',
          timeStyle: 'short',
        }),
      )
    : liens.validite
}

function expedier(
  a: string,
  sujet: string,
  corps: ReturnType<typeof composerCourriel>,
  livraison?: Livraison,
) {
  return envoyer(
    a,
    sujet,
    corps,
    livraison?.id,
    undefined,
    livraison?.differer ?? false,
    livraison ? { db: livraison.db, signal: livraison.signal, lien: true } : undefined,
  )
}

/** Le premier lien du locataire, juste apres l'ouverture. */
export function envoyerLienLocataire({
  a,
  url,
  reference,
  expireLe,
  livraison,
  langue = 'fr',
}: Envoi): Promise<boolean> {
  const liens = choisir(langue, liensFr, liensEn)
  const gabarit = choisir(langue, gabaritFr, gabaritEn)
  const sujet = liens.locataire.sujet(reference)
  return expedier(
    a,
    sujet,
    composerCourriel(
      {
        langue,
        espace: 'locataire',
        sujet,
        titre: liens.locataire.titre,
        paragraphes: [liens.locataire.lien],
        bouton: { url },
        notes: [validite(langue, expireLe), liens.retrouver],
        details: [{ libelle: gabarit.reference, valeur: reference }],
      },
      adresseDuSite(),
    ),
    livraison,
  )
}

/**
 * Le lien du garant, envoye quand le locataire le designe.
 *
 * Il dit qui demande, parce que le garant doit pouvoir reconnaitre la
 * personne avant de deposer quoi que ce soit. Il ne dit rien de plus.
 */
export function envoyerLienGarant({
  a,
  url,
  reference,
  demandePar,
  expireLe,
  livraison,
  langue = 'fr',
}: Envoi & { demandePar: string }): Promise<boolean> {
  const liens = choisir(langue, liensFr, liensEn)
  const gabarit = choisir(langue, gabaritFr, gabaritEn)
  const sujet = liens.garant.sujet(demandePar, reference)
  return expedier(
    a,
    sujet,
    composerCourriel(
      {
        langue,
        espace: 'garant',
        sujet,
        titre: liens.garant.titre,
        paragraphes: [liens.garant.designe(demandePar), liens.garant.lien],
        bouton: { url },
        notes: [validite(langue, expireLe)],
        details: [{ libelle: gabarit.reference, valeur: reference }],
      },
      adresseDuSite(),
    ),
    livraison,
  )
}
