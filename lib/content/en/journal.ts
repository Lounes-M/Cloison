import type { Textes } from '@/lib/i18n'
import type { journal as Fr } from '../journal'

export const journal: Textes<typeof Fr> = {
  titre: 'Access history',
  aide: 'See who accessed your file, and when.',
  indisponible: 'The history is temporarily unavailable.',
  aucun: 'No access recorded.',
  navigation: 'Access history navigation',
  anciens: 'Older accesses',
  recents: 'Most recent accesses',
  acces: 'Access',
  inconnu: 'User',
  par: ' by ',
  actions: {
    dossier_consulte: 'File viewed',
    piece_deposee: 'Document uploaded',
    piece_retiree: 'Document removed',
    piece_ouverte: 'Document opened',
    complement_demande: 'Replacement requested',
    complement_fourni: 'Replacement provided',
    complement_valide: 'Replacement approved',
    complement_refuse: 'New correction requested',
    dossier_transmis: 'File handed over',
    relances_reprises: 'New series of reminders started',
    ocr_demande: 'AI transcription of a document requested',
  },
  acteurs: { agence: 'the agency', garant: 'the guarantor', locataire: 'the tenant' },
}
