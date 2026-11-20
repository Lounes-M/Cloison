import type { Textes } from '@/lib/i18n'
import type { notesDossier as Fr } from '../notes'

export const notesDossier: Textes<typeof Fr> = {
  titre: 'Internal notes',
  aide: 'Visible to the agency’s team members only, never to the tenant or the guarantor. They disappear with the file.',
  champ: 'New note',
  indication: 'For example: guarantor reached by phone, documents promised for Monday.',
  bouton: 'Add the note',
  envoi: 'Adding…',
  vide: 'No note for this file.',
  indisponible: 'Notes are temporarily unavailable.',
  ancien: 'Former team member',
  supprimer: 'Delete',
  suppression: 'Deleting…',
  supprimerNote: (date) => `Delete the note of ${date}`,
  erreurAjout: 'The note could not be added. It must be 1 to 1,000 characters long.',
  erreurSuppression: 'The note could not be deleted.',
  limite: 1000,
}
