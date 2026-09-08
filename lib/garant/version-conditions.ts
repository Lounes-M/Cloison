/** Zero signifie que le formulaire a ete affiche avant toute declaration. */
export function versionConditions(donnees: FormData): number | null {
  const valeur = donnees.get('versionConditions')
  if (typeof valeur !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(valeur)) return null
  const version = Number(valeur)
  return version <= 2147483647 ? version : null
}
