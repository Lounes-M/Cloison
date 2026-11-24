/**
 * Comparaison du revenu declare aux justificatifs, cote agence.
 *
 * Aucune phrase ne conclut a la place de l'agence : un ecart se verifie sur
 * les pieces, et une lecture IA peut se tromper.
 */
export const comparaison = {
  titre: 'Comparer le revenu déclaré aux pièces',
  aide: 'Une IA lit le mois et le montant net payé sur les bulletins de paie et l’attestation de pension du garant, quatre fichiers au plus. Cloison calcule ensuite la moyenne et la compare à la déclaration. C’est une aide à la relecture : elle peut se tromper et ne décide de rien.',
  accord:
    'Envoyer les copies filigranées de ces justificatifs à OpenRouter et à son fournisseur d’IA, sans conservation, pour y lire seulement le mois et le montant net payé.',
  lancer: 'Comparer aux pièces',
  attente: 'Lecture en cours, cela peut prendre une minute…',
  erreur:
    'Comparaison indisponible : accès, quota ou traitement impossible. Vous pouvez toujours ouvrir les pièces.',
  etats: {
    concordant: 'Déclaration cohérente avec les pièces',
    superieur: 'Écart à vérifier',
    inferieur: 'Déclaration inférieure aux pièces',
    illisible: 'Aucun montant lisible',
  },
  phrases: {
    concordant: 'Le revenu déclaré et le montant lu sur les pièces diffèrent de moins de 5 %.',
    superieur: (montant: string, pourCent: number) =>
      `Le revenu déclaré dépasse de ${montant} (${pourCent} %) ce qui a été lu sur les pièces. Un autre revenu, une prime ou une erreur de lecture peuvent l’expliquer : ouvrez les pièces avant de conclure, ou demandez un complément.`,
    inferieur: (montant: string, pourCent: number) =>
      `Le revenu déclaré est inférieur de ${montant} (${pourCent} %) à ce qui a été lu sur les pièces. Le ratio, calculé sur la déclaration, n’en est pas avantagé.`,
    illisible:
      'Aucun montant net payé n’a pu être lu sur ces pièces. Cela ne dit rien du dossier : comparez-les vous-même à la déclaration.',
  },
  declare: 'Revenu déclaré',
  lu: 'Lu sur les pièces',
  salaire: (montant: string, mois: string) =>
    `Moyenne des salaires nets payés (${mois}) : ${montant}.`,
  pension: (montant: string, mois: string) => `Pension nette versée (${mois}) : ${montant}.`,
  partiel: (n: number) =>
    n > 1
      ? `Moyenne calculée sur ${n} mois seulement, au lieu de trois.`
      : 'Un seul mois de salaire a pu être lu, au lieu de trois.',
  variable: 'Les salaires lus varient de plus de 20 % d’un mois à l’autre.',
  contradictoires: (mois: string) =>
    `Deux montants différents ont été lus pour ${mois} : ce mois n’est pas compté.`,
  illisibles: (n: number, total: number) =>
    n > 1
      ? `${n} fichiers sur ${total} n’ont pas pu être lus.`
      : `Un fichier sur ${total} n’a pas pu être lu.`,
  modele: 'Modèle',
  temporaire: 'Résultat temporaire, non enregistré dans le dossier. La décision vous appartient.',
  effacer: 'Effacer le résultat',
}
