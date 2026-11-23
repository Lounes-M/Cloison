import type { Textes } from '@/lib/i18n'
import type { logiciels as Fr } from '../logiciels'

export const logiciels: Textes<typeof Fr> = {
  titre: 'Import your properties from Apimo',
  aide: 'Cloison reads your rental properties in Apimo and creates the matching properties here: label, rent, city, surface area, rooms and availability. No contact, owner or applicant is read, and nothing is written to Apimo.',
  prealable: 'First, ask Apimo support to enable Cloison’s access to your agency’s properties.',
  identifiant: 'Your agency’s identifier at Apimo',
  identifiantAide: 'A number, shown in your Apimo settings. Leave empty to remove the connection.',
  enregistrer: 'Save',
  enregistrement: 'Saving…',
  enregistre: 'Identifier saved.',
  importer: 'Import rental properties',
  importation: 'Importing…',
  dernier: 'Last import',
  jamais: 'No import yet.',
  voir: 'View properties',
  succes: (crees: number, misAJour: number) =>
    `Import complete. Properties created: ${crees}. Properties updated: ${misAJour}.`,
  erreurs: {
    identifiant: 'The identifier is a number of at most ten digits.',
    session: 'Session expired, or operation reserved for the administrator.',
    general: 'The operation did not complete. Try again in a moment.',
    cadence: 'Save the identifier first, or wait one minute between two imports.',
    aucun: 'Apimo shows no rental property for this agency.',
    lecture: {
      non_configure: 'Import from Apimo is not open.',
      refuse:
        'Apimo refused the read. Check the identifier and that access has been enabled with Apimo support.',
      limite: 'Apimo is limiting reads for now. Try again later.',
      indisponible: 'Apimo is not responding. Try again later.',
      reponse_invalide: 'Apimo’s response could not be read. No property was changed.',
      trop_de_biens:
        'Your agency lists more than 200 rental properties. Nothing was imported: write to us for a tailored import.',
    },
  },
}
