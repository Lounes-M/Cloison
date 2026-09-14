const PDF_MAX = 20 * 1024 * 1024

export function lireReponseDocumentaire(
  sortie: Buffer,
  operation: 'verifier' | 'rasteriser',
): Buffer
export function lireReponseDocumentaire(
  sortie: Buffer,
  operation: 'rasteriser',
  pagination: true,
): { pdf: Buffer; pages: number }
export function lireReponseDocumentaire(
  sortie: Buffer,
  operation: 'verifier' | 'rasteriser',
  pagination = false,
): Buffer | { pdf: Buffer; pages: number } {
  let resultat: Record<string, unknown>
  try {
    const lu: unknown = JSON.parse(sortie.toString('utf8'))
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) throw new Error()
    resultat = lu as Record<string, unknown>
  } catch {
    // JSON.parse peut citer la sortie brute, donc du contenu documentaire,
    // dans son erreur. L'appelant journalise uniquement ce message controle.
    throw new Error('Reponse du moteur documentaire invalide')
  }
  const champs =
    resultat.ok === false
      ? ['ok', 'pages']
      : operation === 'verifier'
        ? ['ok']
        : pagination
          ? ['ok', 'pdf', 'pages']
          : ['ok', 'pdf']
  if (
    (resultat.ok !== true && resultat.ok !== false) ||
    Object.keys(resultat).length !== champs.length ||
    Object.keys(resultat).some((champ) => !champs.includes(champ))
  )
    throw new Error('Reponse du moteur documentaire invalide')
  if (resultat.ok === false) {
    if (
      resultat.pages !== null &&
      (typeof resultat.pages !== 'number' ||
        !Number.isSafeInteger(resultat.pages) ||
        resultat.pages < 0)
    )
      throw new Error('Reponse du moteur documentaire invalide')
    if (typeof resultat.pages === 'number' && resultat.pages > 40)
      throw new Error(`Ce document compte ${resultat.pages} pages, au-dela des 40 traitees`)
    throw new Error('Document invalide ou trop volumineux a traiter')
  }
  if (operation === 'verifier') return Buffer.alloc(0)
  // Borne la representation avant allocation. Buffer.from(base64) ignore sinon
  // certains caracteres invalides et accepte des encodages incomplets.
  if (typeof resultat.pdf !== 'string' || resultat.pdf.length > 4 * Math.ceil(PDF_MAX / 3))
    throw new Error('Sortie documentaire invalide')
  const pdf = Buffer.from(resultat.pdf, 'base64')
  if (
    pdf.length > PDF_MAX ||
    pdf.toString('base64') !== resultat.pdf ||
    !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))
  )
    throw new Error('Sortie documentaire invalide')
  if (pagination) {
    if (
      typeof resultat.pages !== 'number' ||
      !Number.isSafeInteger(resultat.pages) ||
      resultat.pages < 1 ||
      resultat.pages > 40
    )
      throw new Error('Pagination du moteur documentaire invalide')
    return { pdf, pages: resultat.pages }
  }
  return pdf
}
