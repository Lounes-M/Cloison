/** Numeros humains, sans URL, expression reguliere utilisateur ou stockage local. */
export function analyserPagesOcr(saisie: string | null): number[] | null {
  if (saisie === null || saisie.trim() === '') return null
  if (saisie.length > 160) throw new Error('Selection de pages invalide')
  const pages = new Set<number>()
  for (const partie of saisie.split(',')) {
    const plage = /^\s*([1-9]\d?)\s*(?:-\s*([1-9]\d?)\s*)?$/.exec(partie)
    if (!plage) throw new Error('Selection de pages invalide')
    const debut = Number(plage[1]),
      fin = Number(plage[2] ?? plage[1])
    if (debut > fin || fin > 40) throw new Error('Selection de pages invalide')
    for (let page = debut; page <= fin; page++) pages.add(page)
  }
  return [...pages].sort((a, b) => a - b)
}
