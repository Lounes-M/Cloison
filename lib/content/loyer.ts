/** Les trois facons dont un loyer mensuel saisi peut etre refuse. */
export const loyerSaisi = {
  illisible: 'Le loyer ne se lit pas. Exemple : 850 ou 850,50.',
  negatif: 'Le loyer doit être supérieur à zéro.',
  plafond: 'Le loyer mensuel ne peut pas dépasser 100 000 €.',
} as const
