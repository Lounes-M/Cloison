import 'server-only'

import { envoyer } from './envoi'
import type { SupabaseClient } from '@supabase/supabase-js'
import { liens } from '@/lib/content/liens'

/**
 * Les courriels qui portent un lien.
 *
 * L'e-mail n'est qu'un canal de livraison : ce qui autorise, c'est le jeton
 * dans le lien, jamais l'adresse (ADR 0006). Ces fonctions ne savent donc rien
 * du dossier au-dela de ce qu'il faut ecrire dans le message.
 *
 * Du texte, pas du HTML. Un lien magique n'a rien a gagner a une mise en page,
 * et il a beaucoup a perdre : les filtres anti-hameconnage se mefient
 * davantage d'un courriel riche portant un lien que d'un courriel nu.
 *
 * Aucune de ces fonctions ne leve. Un envoi rate se voit dans les journaux et
 * dans la valeur de retour ; il ne doit pas transformer un dossier bien ouvert
 * en erreur de serveur.
 */

/** Ce que le courriel montre du dossier : sa reference, rien d'autre. */
type Livraison = { db: SupabaseClient; id: string; signal?: AbortSignal; differer: boolean }
type Envoi = { a: string; url: string; reference: string; expireLe?: Date; livraison?: Livraison }
function validite(date?: Date) {
  return date
    ? liens.fin(date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }))
    : liens.validite
}

/** Le premier lien du locataire, juste apres l'ouverture. */
export function envoyerLienLocataire({
  a,
  url,
  reference,
  expireLe,
  livraison,
}: Envoi): Promise<boolean> {
  return envoyer(
    a,
    `Ton dossier Cloison est ouvert (${reference})`,
    [
      'Ton dossier de garantie est ouvert.',
      '',
      'Voici ton lien pour y revenir, désigner ton garant et suivre l’avancement :',
      url,
      '',
      validite(expireLe),
      liens.retrouver,
      '',
      `Référence du dossier : ${reference}`,
      '',
      'Cloison',
    ].join('\n'),
    livraison?.id,
    undefined,
    livraison?.differer ?? false,
    livraison ? { db: livraison.db, signal: livraison.signal, lien: true } : undefined,
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
}: Envoi & { demandePar: string }): Promise<boolean> {
  return envoyer(
    a,
    `${demandePar} te demande de te porter garant (${reference})`,
    [
      `${demandePar} constitue un dossier de location et t’a désigné comme garant.`,
      '',
      'Voici ton lien pour déposer tes pièces, de ton côté et en toute',
      'discrétion : le locataire ne verra jamais ce que tu déposes, seulement',
      'que le dossier avance.',
      url,
      '',
      validite(expireLe),
      '',
      `Référence du dossier : ${reference}`,
      '',
      'Cloison',
    ].join('\n'),
    livraison?.id,
    undefined,
    livraison?.differer ?? false,
    livraison ? { db: livraison.db, signal: livraison.signal, lien: true } : undefined,
  )
}
