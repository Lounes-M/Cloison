/** Le code de candidature seul, depuis le lien complet ou le code colle tel quel (0070). */
export function codeDeCandidature(saisie: string): string | null {
  const trouve = /(?:^|\/candidater\/)([a-f0-9]{32})(?:[/?#].*)?$/.exec(saisie.trim().toLowerCase())
  return trouve ? trouve[1]! : null
}
