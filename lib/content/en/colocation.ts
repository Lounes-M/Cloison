import type { Textes } from '@/lib/i18n'
import type { colocation as Fr } from '../colocation'
import { euros } from './tarifs'

/** Flat share, as seen by the agency, the flatmate and their guarantor. */
export const colocation: Textes<typeof Fr> = {
  titre: 'Flat share',
  retour: 'All files',
  etendues: {
    part: 'Each guarantor commits to their flatmate’s share',
    loyer_entier: 'Each guarantor commits to the whole rent (joint tenancy)',
  },
  entete: (total, n) => `${euros(total)} total rent, ${n} flatmate${n > 1 ? 's' : ''}`,
  logement: 'Property',
  etat: {
    complete: 'Every file is complete: the flat share can be reviewed.',
    enCours: (complets, n) => `${complets} of ${n} file${n > 1 ? 's' : ''} complete.`,
    vide: 'No open file in this flat share.',
  },
  decision:
    'Accepting, declining or closing is done file by file: a declined flatmate can be replaced without touching the others.',
  tableau: {
    titre: 'Flatmates',
    locataire: 'Flatmate',
    reference: 'File',
    statut: 'Status',
    loyer: 'Guaranteed rent',
    ratio: 'Affordability',
    attente: 'Pending',
    sansLoyer: 'To be entered',
    partis: 'Declined or closed files',
  },
  parts: {
    ecart: (somme, total) =>
      `The shares add up to ${euros(somme)} for a total rent of ${euros(total)}. Correct the rent on each file.`,
    incompletes: 'The share of some flatmates still has to be entered on their file.',
  },
  formulaire: {
    titre: 'Open a flat share',
    aide: 'Several tenants on one lease, each with their own guarantor. Each receives their own link and file: none of them sees the documents or progress of the others.',
    courriels: 'Flatmates’ email addresses',
    courrielsAide: 'One address per line, two to eight flatmates.',
    courrielsAjout: 'New flatmate’s email address',
    courrielsAjoutAide: 'One address per line if several flatmates join together.',
    loyer: 'Total rent of the lease, charges included',
    loyerAide:
      'When guarantors commit to a share, the rent is split equally. You can correct each share on the flatmate’s file.',
    etendue: 'Commitment of each guarantor',
    bouton: 'Send the links',
    boutonAjout: 'Add to the flat share',
    envoi: 'Sending…',
    ajoutTitre: 'Add a flatmate',
    ajoutAide:
      'For one more flatmate or the replacement of a declined one. Their share is suggested as an equal split and can be corrected on their file.',
    succes: (n) => `${n} file${n > 1 ? 's' : ''} opened. The links are scheduled for sending.`,
    voir: 'View the flat share',
    echecs: (adresses) =>
      `These addresses could not be added: ${adresses}. Try again from the flat share page.`,
  },
  erreurs: {
    adresses: 'Enter two to eight valid email addresses, one per line.',
    adresse: 'Enter at least one valid email address.',
    doublon: 'Each flatmate has their own address: one address appears twice.',
    dejaPresente: 'One of these addresses is already in the flat share.',
    trop: 'A flat share has at most eight flatmates.',
    loyer: 'The total rent cannot be read. Example: 1200 or 1200.50.',
    impossible: 'The flat share could not be opened. Try again in a moment.',
    nonVerifiee: 'Your agency is not verified yet: opening a flat share waits for verification.',
    session: 'Session expired.',
  },
  fiche: {
    lien: (n) => `This file is part of a flat share of ${n} people.`,
    ouvrir: 'View the flat share',
  },
  acte: 'This file is part of a flat share. The deed will name the guaranteed flatmate and reproduce article 8-1 of the 1989 act. Enter the rent of the whole lease, and name the other flatmates’ guarantors under “Other guarantors”.',
  locataire: {
    titre: 'Flat share',
    texte: (n, total) =>
      `You are part of a flat share of ${n} people, for a total rent of ${total}. Each flatmate has their own file and their own guarantor: you do not see theirs, and they do not see yours.`,
    montant: (montant) => `Amount used for your file: ${montant}.`,
    loyerPart: 'Your share of the rent is set by the agency. If it is wrong, write to them.',
    loyerEntier:
      'The tenancy is joint: your guarantor commits to the whole rent. This amount is set by the agency.',
  },
  garant: {
    part: (n, total) =>
      `This lease is a flat share of ${n} people, for a total rent of ${total}. You guarantee one flatmate only, for their share of the rent.`,
    loyerEntier: (n, total) =>
      `This lease is a joint flat share of ${n} people, for a total rent of ${total}. You guarantee one flatmate only, but for the whole rent.`,
  },
}
