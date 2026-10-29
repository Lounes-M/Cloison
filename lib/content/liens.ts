export const liens = {
  validite:
    'Ce lien est réutilisable pendant sept jours au maximum, dans la limite de validité du dossier. Un nouveau lien remplace le précédent.',
  fin: (date: string) =>
    `Ce lien est réutilisable jusqu’au ${date} (heure de Paris), sauf révocation ou expiration du dossier. Un nouveau lien remplace le précédent.`,
  retrouver: 'Si tu le perds, demande un nouveau lien depuis la page Retrouver mon dossier.',
  garant: {
    sujet: (demandePar: string, reference: string) =>
      `${demandePar} vous demande de vous porter garant (${reference})`,
    designe: (demandePar: string) =>
      `${demandePar} constitue un dossier de location et vous a désigné comme garant.`,
    lien: [
      'Voici votre lien pour déposer vos pièces, de votre côté et en toute',
      'discrétion : le locataire ne verra jamais ce que vous déposez, seulement',
      'que le dossier avance.',
    ],
  },
}
