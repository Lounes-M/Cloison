import 'server-only'

/**
 * Deux interrupteurs serveur, fermes par defaut.
 *
 * `CONNECTEUR_APIMO` se pose apres la migration 0096 : sans lui, aucun ecran
 * n'apparait et aucune fonction SQL du connecteur n'est appelee. Il n'ouvre
 * rien a lui seul : chaque agence doit encore enregistrer ses identifiants.
 *
 * `APIMO_RETOUR_STATUT` ouvre les ecritures chez Apimo. Il reste ferme tant
 * que le point d'ecriture n'a pas ete confirme en recette avec de vrais
 * identifiants (voir lib/connecteurs/apimo/client.ts).
 */
export function apimoActif(): boolean {
  return process.env.CONNECTEUR_APIMO === 'true'
}
export function retourApimoActif(): boolean {
  return apimoActif() && process.env.APIMO_RETOUR_STATUT === 'true'
}
