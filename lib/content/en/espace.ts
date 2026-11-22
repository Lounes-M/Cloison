import type { Textes } from '@/lib/i18n'
import type * as Fr from '../espace'

/** Ce que l'agence lit, en anglais. Les chiffres n'apparaissent qu'ici. */
export const tableau: Textes<typeof Fr.tableau> = {
  connecte: 'Signed in as',
  administrateur: ', administrator',
  tri: 'Sort files',
  tris: {
    recent: 'Recently opened',
    echeance: 'Nearest deadline',
    activite: 'Longest without activity',
  },
  horizon: 'End of the vault',
  horizons: {
    tous: 'All deadlines',
    sept: 'Within the next 7 days',
    trente: 'Within the next 30 days',
  },
  aideEcheance:
    'Periods start from now. This deadline concerns the document vault; it does not describe the duration of the signed deed. Dates are shown in Paris time.',
  ratioAVenir: 'pending',
  finCoffre: (date) => `End of vault: ${date}`,
  dateIndisponible: 'date unavailable',
  rechercheReference: 'File reference',
  rechercheEmail: 'Tenant’s email',
  rechercheNom: 'Tenant’s name',
  rechercher: 'Search',
  filtresAvances: 'Status, person responsible, deadline and follow-up',
  remplacement: 'Only files with a document replacement to review',
  pastilles: {
    remplacement: 'Replacement to review',
    sans_nouvelles: 'No news for 7 days',
    relances_epuisees: 'Reminders used up',
  },
  sansNouvelles: 'Only files waiting for the tenant or the guarantor, with no activity for 7 days',
  sansGarant: 'Only files on hold where the tenant has not named a guarantor yet',
  relancesEpuisees:
    'Only files where the guarantor has received their 3 automatic reminders and done nothing since',
  effacer: 'Clear filters',
  aucunResultat: 'No file on this page. Change the filters or go back to the previous page.',
  pagination: 'File pages',
  precedente: 'Previous page',
  suivante: 'Next page',
  page: (numero) => `Page ${numero}`,
  dossiers: 'Your files',
  aucun: 'No file yet. Open one below: the tenant receives their link.',
  colonnes: {
    reference: 'Reference',
    locataire: 'Tenant',
    statut: 'Status',
    ratio: 'Ratio',
    ouvert: 'Opened on',
  },
  nouveau: 'Open a file',
  nouveauAide: 'The tenant receives a link to name their guarantor. You have nothing else to send.',
  nouveauChamp: 'Tenant’s email address',
  nouveauLoyer: 'Monthly rent, charges included (optional)',
  nouveauLoyerAide:
    'If you know it, the tenant will not have to enter it. It can still be changed until the guarantor makes their declaration.',
  nouveauLoyerInvalide: 'The rent cannot be read. Example: 850 or 850.50.',
  nouveauBouton: 'Send the link',
  nouveauEnvoi: 'Sending…',
  nouveauSucces: (email) => `File opened. The link to ${email} is scheduled to be sent.`,
  nonVerifieeTitre: 'Space not verified',
  nonVerifieeTexte:
    'You have access to the whole product on a demo file. Opening a file for a real tenant requires your SIREN number and your professional card to be verified.',
  seuilTitre: 'Your threshold',
  seuilAide:
    'The guarantor’s net income, as a multiple of the rent including charges, from which a file is considered complete. Three is the most common practice. Changing it reassesses your files that are still open.',
  seuilChamp: 'Times the rent',
  seuilBouton: 'Save',
  seuilEnvoi: 'Saving…',
  seuilSucces: 'Threshold saved. Your open files have been reassessed.',
  seuilLecture: (seuil) =>
    `Agency threshold: ${seuil} times the rent. Only an administrator can change it.`,
  demonstration: 'demo',
  demoTitre: 'See the product on a demo file',
  demoAide:
    'A fictitious guarantor, their sealed and watermarked documents, their ratio, the access log: everything, except sending a real link. It appears in your list, marked as such.',
  demoBouton: 'Open the demo',
  demoBanniere: 'Demo file. Nothing here is real: the documents say so across every page.',
}

export const support: Textes<typeof Fr.support> = {
  titre: 'A file stuck?',
  texte: (adresse) =>
    `Write to ${adresse}. A person replies within four working hours for a file that is stuck, and within one working day for anything else, Monday to Friday, 9am to 6pm (Paris time).`,
  limite:
    'We never open a document on your behalf: the access log is written in the name of whoever acts.',
}

export const activation: Textes<typeof Fr.activation> = {
  titre: 'Request activation',
  texte:
    'To open real files, your agency must be verified: its SIREN number, which can be checked publicly, and its “Gestion immobilière” professional card. You declare them, we check, and you are activated within 48 working hours.',
  siren: 'SIREN',
  cartePro: 'Professional card number',
  aide: 'The “Gestion immobilière” card issued by the CCI, in the agency’s name.',
  bouton: 'Request activation',
  envoi: 'Sending…',
  succes: 'Request sent. We check and get back to you within 48 working hours.',
  enAttente: (date) =>
    `Request sent on ${date}. We check and get back to you within 48 working hours.`,
  membre: 'Only an administrator of the agency can request activation.',
}

export const dossier: Textes<typeof Fr.dossier> = {
  couvreLibelle: 'Covers',
  nature: 'Type',
  profilDeclare: 'Declared profile:',
  ouvertLe: 'Opened on',
  expireLe: ', expires on',
  derniereActivite: (date) => `Last activity on the file: ${date}.`,
  relancesGarant: (nombre, date) =>
    `Automatic reminders to the guarantor: ${nombre} of 3, the latest on ${date}.`,
  prochaineRelance: (date) => `Next automatic reminder to the guarantor from ${date}.`,
  relancesDesactivees: 'Automatic reminders to the guarantor are switched off for your agency.',
  retour: 'All files',
  reference: 'Reference',
  locataire: 'Tenant',
  garant: 'Guarantor',
  garantAucun: 'not named yet',
  loyer: 'Rent, charges included',
  loyerAucun: 'not entered by the tenant yet',
  engagementTitre: 'What the guarantor covers',
  engagementAucun: 'The guarantor has not declared anything yet.',
  couvre: { loyer: 'The rent only', loyer_charges: 'The rent and the charges' },
  montant: 'Maximum amount, in total',
  sansPlafond: 'maximum amount to be specified',
  jusquAu: 'Until',
  dureeDuBail: 'the duration of the lease',
  solidaire: 'Joint and several guarantee',
  simple: 'Simple guarantee',
  revenu: 'Declared net monthly income',
  revenuAucun: 'not declared yet',
  ratioTitre: 'Solvency',
  ratioAttente: 'Waiting for the rent and the declared income.',
  ratio: (ratio, seuil) => `${ratio} times the rent, for a threshold of ${seuil}.`,
  piecesTitre: 'Documents',
  piecesAucune: 'No document uploaded yet.',
  ouvrir: 'Open',
  ouvrirAide:
    'Every opening is recorded in the log, and the document reaches you watermarked with your name. The guarantor can see that you viewed it.',
  journalTitre: 'Access log',
  journalAucun: 'No one has opened this file yet.',
  actionsTitre: 'Decision',
  prendre: 'Accept the file',
  prendreAide:
    'Freezes the documents: the guarantor can no longer remove anything. Do this once you have what you need to decide.',
  refuser: 'Decline the file',
  refuserAide: 'The tenant is told of the refusal, without the reason.',
  prisTexte: 'File accepted. The documents are frozen; you can now prepare the guarantee deed.',
  refuseTexte: 'File declined.',
}

export const relanceGarant: Textes<typeof Fr.relanceGarant> = {
  aide: 'The guarantor has not responded to their three automatic reminders. After speaking with them, you can start a new cycle of three reminders: the first goes out within the next few hours.',
  bouton: 'Remind the guarantor again',
  envoi: 'Sending reminder…',
  succes: 'Noted: a new cycle of reminders is starting.',
  erreur:
    'Reminder not possible. Only an administrator or the person responsible for the file can send one, and only on a file whose reminders are used up.',
}

export const loyerAgence: Textes<typeof Fr.loyerAgence> = {
  titre: 'Rent of the property',
  champ: 'Monthly rent, charges included',
  bouton: 'Save the rent',
  envoi: 'Saving…',
  succes: 'Rent saved. The tenant sees it in their file.',
  invalide: 'The rent cannot be read. Example: 850 or 850.50.',
  erreur: 'The rent could not be saved. It may already be frozen by the guarantor’s declaration.',
  fige: 'The rent is frozen: the guarantor declared their income on this basis.',
  second: 'The rent is entered on the first guarantor’s file and copied here.',
}

export const groupe: Textes<typeof Fr.groupe> = {
  principal: (reference) =>
    `This file belongs to the second guarantor. The first guarantor is in file ${reference}.`,
  second: (reference) =>
    `A second guarantor has been named, in file ${reference}. Both incomes are assessed together.`,
  lien: 'Open the other file',
  ratio: (valeur) => `Solvency of both guarantors together: ${valeur}× the rent.`,
  ratioAttente:
    'The combined solvency will appear once both guarantors have declared their income.',
  decision: 'Accepting, declining or closing this file applies to both guarantors.',
}

export const cloture: Textes<typeof Fr.cloture> = {
  titre: 'Close the file',
  aide: 'Has the applicant withdrawn, or has the property been let? Closing the file immediately removes everyone’s access and destroys the encryption key of the documents. The remaining data goes at the next purge. The tenant and the guarantor are notified by email. This cannot be undone.',
  reserve:
    'Reserved for an administrator or the person responsible. An accepted file must be declined first.',
  champ: (reference) => `Type the reference ${reference} again to confirm`,
  bouton: 'Close and erase the file',
  envoi: 'Closing…',
  erreur:
    'The file was not closed. Check the reference; only an administrator or the person responsible for the file can close it, and an accepted file must be declined first.',
  succes: (reference) =>
    `File ${reference} closed. Its accesses are shut and its documents will be purged.`,
}

export const statuts: Textes<typeof Fr.statuts> = {
  ouvert: { libelle: 'Open', ton: 'sky' },
  depot_en_cours: { libelle: 'Upload in progress', ton: 'sun' },
  complet: { libelle: 'Complete', ton: 'mint' },
  garant_insuffisant: { libelle: 'Insufficient guarantor', ton: 'flame' },
  transmis: { libelle: 'Accepted', ton: 'mint' },
  signe: { libelle: 'Signed', ton: 'mint' },
  refuse: { libelle: 'Declined', ton: 'paper' },
  expire: { libelle: 'Expired', ton: 'paper' },
}

export const natures: Textes<typeof Fr.natures> = {
  bulletin_paie: 'Payslip',
  avis_imposition: 'Tax assessment notice',
  piece_identite: 'Identity document',
  justificatif_domicile: 'Proof of address',
  contrat_travail: 'Employment contract',
  pension_retraite: 'Pension entitlement',
  bilan_comptable: 'Annual accounts',
  attestation_ressources: 'Statement of income',
  activite_independante: 'Professional activity',
}

export const actions: Textes<typeof Fr.actions> = {
  dossier_consulte: 'viewed the file',
  piece_deposee: 'uploaded a document',
  piece_retiree: 'removed a document',
  piece_ouverte: 'opened a document',
  ocr_demande: 'requested an AI transcription',
  complement_demande: 'requested the replacement of a document',
  complement_fourni: 'provided a replacement document',
  complement_valide: 'approved a replacement document',
  complement_refuse: 'requested a new correction',
  dossier_transmis: 'accepted the file',
  relances_reprises: 'reminded the guarantor again',
}

export const acteurs: Textes<typeof Fr.acteurs> = {
  agence: 'The agency',
  garant: 'The guarantor',
  locataire: 'The tenant',
}
