import type { AgenceDuDossier } from '@/lib/acces/agence-du-dossier'

function bien(a: AgenceDuDossier): string {
  if (!a.logement) return ''
  return a.ville
    ? ` pour le logement « ${a.logement} » (${a.ville})`
    : ` pour le logement « ${a.logement} »`
}

/**
 * Qui suit le dossier (0073). `locataire` tutoie, `garant` vouvoie.
 */
export const agenceDuDossier = {
  locataire: (a: AgenceDuDossier) =>
    `Ton dossier est suivi par ${a.agence}${bien(a)}. Seule cette agence le consulte.`,
  garant: (a: AgenceDuDossier) =>
    `Ce dossier est suivi par ${a.agence}${bien(a)}. Seule cette agence consulte vos pièces.`,
}
