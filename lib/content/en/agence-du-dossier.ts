import type { AgenceDuDossier } from '@/lib/acces/agence-du-dossier'
import type { Textes } from '@/lib/i18n'
import type { agenceDuDossier as Fr } from '../agence-du-dossier'

function bien(a: AgenceDuDossier): string {
  if (!a.logement) return ''
  return a.ville
    ? ` for the property “${a.logement}” (${a.ville})`
    : ` for the property “${a.logement}”`
}

export const agenceDuDossier: Textes<typeof Fr> = {
  locataire: (a) =>
    `Your file is handled by ${a.agence}${bien(a)}. Only this agency can review it.`,
  garant: (a) =>
    `This file is handled by ${a.agence}${bien(a)}. Only this agency can review your documents.`,
}
