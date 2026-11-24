/**
 * Un champ d'une ligne tient sur une ligne.
 *
 * Le nom d'une agence, sa ville ou sa carte professionnelle sont recopies dans
 * des courriels internes en texte brut, dont certains portent une ligne SQL a
 * coller dans l'editeur Supabase. Un saut de ligne dans un de ces champs
 * permettrait d'y ecrire de fausses consignes, ou un faux en-tete dans le
 * sujet. Les caracteres de controle, les separateurs de ligne Unicode et les
 * marques d'inversion du sens d'ecriture deviennent donc une espace.
 *
 * La base refuse les memes caracteres (migration 0097) : ce module nettoie ce
 * que les formulaires envoient, la contrainte arrete ce qui ne passe pas par
 * eux.
 */
const HORS_LIGNE = /[\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]+/gu

export function surUneLigne(texte: string): string {
  return texte.replace(HORS_LIGNE, ' ').replace(/ {2,}/g, ' ').trim()
}

/**
 * Un texte libre cite dans un courriel interne : chaque ligne porte une marque
 * de citation, pour qu'aucune ne se lise comme une consigne du courriel.
 */
export function enCitation(texte: string): string {
  return texte
    .split(/\r\n|[\n\r\u2028\u2029]/)
    .map((ligne) => `> ${surUneLigne(ligne)}`)
    .join('\n')
}
