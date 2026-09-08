export const liens = {
  validite:
    'Ce lien est réutilisable pendant sept jours au maximum, dans la limite de validité du dossier. Un nouveau lien remplace le précédent.',
  fin: (date: string) =>
    `Ce lien est réutilisable jusqu’au ${date} (heure de Paris), sauf révocation ou expiration du dossier. Un nouveau lien remplace le précédent.`,
  retrouver: 'Si tu le perds, demande un nouveau lien depuis la page Retrouver mon dossier.',
}
