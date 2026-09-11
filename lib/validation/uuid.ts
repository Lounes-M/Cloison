// Forme PostgreSQL canonique utilisee par les identifiants emis dans l'application.
// Pas de contrainte sur la version UUID ; aucune coercition ni suppression d'espaces.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function estUuidCanonique(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && valeur.length === 36 && UUID.test(valeur)
}
