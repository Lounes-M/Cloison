/**
 * Les tranches de volume du formulaire de demonstration.
 *
 * Dans un module a part, sans dependance : le formulaire, rendu dans le
 * navigateur, n'a besoin que de cette liste. L'importer depuis `schema.ts`
 * embarquait toute la bibliotheque de validation dans la page publique des
 * agences (une trentaine de kilo-octets compresses) pour quatre libelles.
 */
export const VOLUMES = [
  { valeur: 'moins-de-10', libelle: 'Moins de 10' },
  { valeur: '10-50', libelle: 'Entre 10 et 50' },
  { valeur: '50-200', libelle: 'Entre 50 et 200' },
  { valeur: 'plus-de-200', libelle: 'Plus de 200' },
] as const
