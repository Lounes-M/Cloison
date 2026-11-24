import type { Textes } from '@/lib/i18n'
import type { apimo as Fr } from '../apimo'

export const apimo: Textes<typeof Fr> = {
  titre: 'Apimo',
  etiquette: 'Your software',
  aide: 'Open a guarantee file from a rental property in your Apimo, without re-entering the property. Cloison reads your rental properties when you ask for them and keeps no copy.',
  cles: 'Ask Apimo support for the provider ID, the token and the agency ID of your API access. The token is encrypted before it is saved and is never shown again.',
  etat: {
    absent: 'Not connected',
    actif: 'Connected',
    erreur: 'Connected, last read failed',
  },
  verifieLe: (date: string) => `Last successful read on ${date}`,
  jamaisVerifie: 'No successful read yet',
  identifiants: (fournisseur: string, agence: string) =>
    `Provider ${fournisseur}, agency ${agence}`,
  fournisseur: 'Provider ID',
  agence: 'Apimo agency ID',
  jeton: 'API token',
  jetonAide: 'Enter it again to replace the saved credentials.',
  retour: 'Write the file status on the property record in Apimo',
  retourAide:
    'Only the file reference and its simplified status are sent: to complete, ready, in progress, signed or closed. No name, no amount, no document.',
  retourFerme:
    'Sending the status back to Apimo is not open yet. Your choice will apply as soon as it opens.',
  confirmation: 'I confirm this operation on my agency’s connection.',
  enregistrer: 'Check and save',
  reglerRetour: 'Save this choice',
  retirer: 'Remove the connection',
  retirerAide:
    'Cloison will no longer call Apimo. Files already opened remain, with no status sent back.',
  attente: 'Checking…',
  succes: {
    configure: 'Credentials checked and saved.',
    retour: 'Choice saved.',
    retire: 'Connection removed.',
  },
  echecs: {
    session: 'Session expired, or insufficient rights.',
    saisie: 'Check the three fields: two numeric IDs and the token, with no space.',
    refus:
      'Apimo refused these credentials for this agency. Check them, or ask Apimo support whether the access is enabled.',
    limite: 'Too many requests in a short time. Try again in a few minutes.',
    indisponible: 'Apimo is not responding. Try again in a moment.',
    reponse: 'Apimo’s response cannot be read. Please tell Cloison support.',
    secret: 'The saved token can no longer be read. Enter your credentials again.',
    general: 'Operation not possible. Try again in a moment.',
  },
  ouverture: {
    titre: 'Open a file from Apimo',
    lien: 'Open from Apimo',
    aide: 'Choose the property and give the prospective tenant’s address: they receive their link, and the file is attached to the property.',
    retourEspace: 'Back to files',
    nonConnecte:
      'Your agency has not connected Apimo yet. An administrator can do so in the settings, under Software connections.',
    reglages: 'Open the connection settings',
    aucun: 'Apimo returns no active rental property for your agency.',
    tronque:
      'Your portfolio exceeds 500 records: this list is partial. If the property is missing, open the file from your workspace.',
    biens: 'Rental property',
    sansLoyer: 'rent not given',
    surface: (m2: string) => `${m2} m²`,
    pieces: (n: number) => (n > 1 ? `${n} rooms` : '1 room'),
    reference: (r: string) => `Ref. ${r}`,
    courriel: 'Tenant’s email address',
    bail: 'Lease number in Apimo (optional)',
    bailAide: 'Letters, digits, dots, hyphens and slashes, 40 characters at most.',
    loyer: 'Monthly rent, charges included (optional)',
    loyerAide: 'Leave empty to use the price on the Apimo record. Check that it includes charges.',
    bouton: 'Open the file',
    envoi: 'Opening…',
    succes: (email: string) => `File opened. The link to ${email} is scheduled.`,
    incomplet:
      'The file is open, but its link to Apimo was not saved. You can follow it from your workspace.',
    erreurs: {
      bien: 'Choose a property from the list.',
      bienAbsent:
        'This property is no longer among your rental properties in Apimo. Reload the page.',
      bail: 'This lease number cannot be read.',
      nonVerifiee:
        'Your agency is not verified yet: opening a file for a real tenant waits for verification.',
    },
  },
  dossier: {
    titre: 'Apimo',
    bien: (id: string) => `Opened from property ${id}`,
    bail: (b: string) => `Lease ${b}`,
    envoye: (etat: string, date: string) => `Status written in Apimo on ${date}: ${etat}`,
    pasEnvoye: 'No status written in Apimo yet.',
    etats: {
      a_completer: 'to complete',
      pret: 'ready',
      en_cours: 'in progress',
      signe: 'signed',
      clos: 'closed',
    },
  },
}
