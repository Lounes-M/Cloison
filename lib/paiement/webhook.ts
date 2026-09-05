import 'server-only'

/**
 * Ce qu'on repond a Stripe apres avoir tente de marquer un dossier regle.
 *
 * Stripe rejoue un evenement tant qu'il ne recoit pas une reponse 2xx, pendant
 * trois jours. C'est un filet, pas un bruit : un locataire qui a paye pendant
 * que notre base ne repondait pas, ou avant qu'une migration soit appliquee,
 * doit finir marque regle sans qu'on ait a le retrouver a la main.
 *
 * Il faut donc distinguer deux echecs qui se ressemblent dans le code appelant
 * et n'ont rien a voir.
 *
 * - Une anomalie definitive : la base a compris et refuse pour une raison qui
 *   ne changera pas en rejouant, deux references de paiement pour un meme
 *   dossier. On repond 200, elle se lit dans les journaux.
 * - Un echec passager : reseau, base indisponible, droit manquant parce que la
 *   migration n'est pas encore appliquee. On repond 503 pour que Stripe
 *   revienne. Le paiement n'est pas perdu, il est en attente.
 *
 * Un dossier introuvable, `data === false`, n'est pas une erreur : il a ete
 * purge entre le paiement et l'evenement, et rejouer n'y changerait rien.
 */

/** Codes SQLSTATE qu'un rejeu ne changera pas. */
const ANOMALIES_DEFINITIVES = new Set([
  // unique_violation : le dossier est deja regle avec une autre reference.
  '23505',
])

export type ResultatMarquage = {
  data: unknown
  error: { code?: string | null; message?: string | null } | null
}

export type ReponseWebhook = { statut: number; corps: Record<string, boolean> }

export function reponseAuMarquage(resultat: ResultatMarquage): ReponseWebhook {
  if (!resultat.error) {
    return { statut: 200, corps: { recu: true, marque: resultat.data === true } }
  }

  if (resultat.error.code && ANOMALIES_DEFINITIVES.has(resultat.error.code)) {
    return { statut: 200, corps: { recu: true, marque: false, anomalie: true } }
  }

  return { statut: 503, corps: { recu: false } }
}
