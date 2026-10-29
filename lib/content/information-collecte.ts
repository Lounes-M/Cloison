/**
 * L'information due au moment de la collecte (article 13 du RGPD), affichee
 * avant chaque saisie. A part des pages juridiques pour ne pas les embarquer
 * dans les formulaires clients. Le detail vit sur `/confidentialite`.
 */
export const informationCollecte = {
  locataire:
    'Ton adresse sert à t’envoyer ton lien et à suivre ton dossier, effacé au plus tard trois mois après son ouverture.',
  garant:
    'Vos pièces sont chiffrées, l’agence ne les voit que filigranées à son nom, et elles sont effacées avec le dossier, au plus tard trois mois après son ouverture.',
  lien: 'Ce que nous en faisons',
} as const
