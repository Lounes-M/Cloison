/** Le champ identifie la page affichee ; seule la capacite autorise le dossier. */
export function formulaireDuDossier(donnees: FormData, dossierId: string): boolean {
  const attendu = donnees.get('dossier')
  return typeof attendu === 'string' && attendu.length > 0 && attendu === dossierId
}
