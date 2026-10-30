/**
 * Les questions frequentes en donnees structurees schema.org.
 *
 * Les moteurs de recherche peuvent afficher la reponse sous le lien. On
 * reprend le texte exact de la page, rien de plus : une donnee structuree qui
 * dirait autre chose que l'ecran serait trompeuse, et penalisee.
 */
export function faqStructuree(
  groupes: readonly { questions: readonly { question: string; reponse: string }[] }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: groupes.flatMap((g) =>
      g.questions.map((q) => ({
        '@type': 'Question',
        name: q.question,
        acceptedAnswer: { '@type': 'Answer', text: q.reponse },
      })),
    ),
  }
}

/**
 * Le JSON pret a poser dans un `<script type="application/ld+json">`.
 *
 * `<` est echappe : sans cela, un `</script>` dans un texte fermerait la
 * balise et ce qui suit serait lu comme du HTML.
 */
export function jsonPourScript(donnees: unknown): string {
  return JSON.stringify(donnees).replace(/</g, '\\u003c')
}
