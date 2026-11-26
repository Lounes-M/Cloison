import type { Textes } from '@/lib/i18n'
import type * as Fr from '../garant'

/**
 * Ce que le garant lit, en anglais. Les valeurs techniques (`valeur`,
 * `attendu`) sont celles du francais : seul le texte change.
 */
export const natures: Textes<typeof Fr.natures> = [
  {
    valeur: 'bulletin_paie',
    libelle: 'Payslips',
    aide: 'The last three. One file per payslip, or a single PDF containing them.',
    attendu: 3,
  },
  {
    valeur: 'avis_imposition',
    libelle: 'Tax assessment notice',
    aide: 'The latest one, all pages.',
    attendu: 1,
  },
  {
    valeur: 'piece_identite',
    libelle: 'Identity document',
    aide: 'Identity card, front and back, or passport.',
    attendu: 1,
  },
  {
    valeur: 'justificatif_domicile',
    libelle: 'Proof of address',
    aide: 'Energy, water or phone bill less than three months old.',
    attendu: 1,
  },
  {
    valeur: 'contrat_travail',
    libelle: 'Employment contract',
    aide: 'Or an employer’s certificate. Optional if the payslips are enough.',
    attendu: 0,
  },
  {
    valeur: 'pension_retraite',
    libelle: 'Pension entitlement',
    aide: 'Proof of entitlement issued by the paying body.',
    attendu: 1,
  },
  {
    valeur: 'bilan_comptable',
    libelle: 'Annual accounts',
    aide: 'The last two sets of accounts, separately or in a single PDF. A statement of income can replace them.',
    attendu: 2,
  },
  {
    valeur: 'attestation_ressources',
    libelle: 'Statement of income',
    aide: 'For the current year, issued by an accountant. Replaces the two sets of accounts.',
    attendu: 0,
  },
  {
    valeur: 'activite_independante',
    libelle: 'Professional activity',
    aide: 'Recent proof suited to your activity: INSEE identification, registration or professional card.',
    attendu: 1,
  },
]

export const profilsRessources: Textes<typeof Fr.profilsRessources> = [
  { valeur: 'salarie', libelle: 'Employee' },
  { valeur: 'retraite', libelle: 'Retired' },
  { valeur: 'independant', libelle: 'Self-employed' },
]

export const documentsDeclares: Textes<typeof Fr.documentsDeclares> = {
  profil: (libelle) => `List adapted to your situation: ${libelle.toLowerCase()}.`,
  changerProfil: 'Change my situation',
  nombre: 'Number of documents in this file',
  aide: 'Enter the number of separate documents, not the number of pages. The content will be reviewed by the agency.',
  bilan: (nombre) => `${nombre} document${nombre > 1 ? 's' : ''} declared`,
  presence:
    'This list follows the documents declared. Their presence certifies neither their content nor their authenticity.',
  corriger: 'Correct the declared number',
  invalide: 'Enter a number of documents that fits this item.',
  erreur: 'The declaration of the content could not be saved.',
}

export const depot: Textes<typeof Fr.depot> = {
  vide: 'Choose a file that is not empty.',
  tropLourd:
    'This file is larger than 4 MB. Reduce its size or choose a better-framed photo before trying again.',
  preparation: 'Preparing the photo…',
  selection: 'File selected:',
  annulerSelection: 'Cancel the selection',
  ajouterPage: 'Add a page',
  retirerDernierePage: 'Remove the last page',
  reunion: 'Combining the pages…',
  reunies: (pages, taille) => `${pages} pages combined into a single PDF (${taille})`,
  melange: 'To combine several files, choose photos only. A PDF is uploaded on its own.',
  tropDePages: 'A document combines at most 12 pages. Beyond that, upload a PDF.',
  reunionTropLourde:
    'These combined pages are larger than 4 MB. Remove one, or upload the document as a PDF.',
  photoIllisible: 'One of these photos cannot be read. Retake it or choose another file.',
  reunionImpossible:
    'This browser cannot combine your photos. Upload the document as a single PDF.',
  debit: 'Too many documents have been offered recently. Try again in fifteen minutes.',
  original: 'Download my original',
  titre: 'Your upload',
  demandePar: (email) => `${email} has named you as their guarantor.`,
  reference: 'Reference',
  discretion:
    'Your documents are encrypted by our server before they are stored, and the tenant has no access to them. They only see that the file is moving forward.',
  piecesTitre: 'Your documents',
  formats:
    'PDF, JPEG or PNG, 4 MB per file. A well-framed photo is enough. Several pages? Photograph them one by one: they are combined into a single PDF.',
  ajouter: 'Add a file',
  deposer: 'Upload the selected file',
  depose: 'Document uploaded.',
  rappelSelection: 'This file is not uploaded yet. Finish with “Upload the selected file”.',
  envoi: 'Sending…',
  retirer: 'Remove',
  retraitEnCours: 'Removing…',
  deposeLe: (date) => `uploaded on ${date}`,
  fermeTitre: 'The upload is closed',
  fermeTexte:
    'The file has gone to the agency. Your documents no longer change: the agency decides on them.',
  expire: (date) => `This file expires on ${date}.`,
}

export const engagement: Textes<typeof Fr.engagement> = {
  resume: {
    loyer: 'Rent only',
    loyerCharges: 'Rent and service charges',
    plafond: ', up to',
    auTotal: '€ in total',
    jusquAu: ', until',
    solidaire: ', joint and several guarantee',
    aucun: 'No commitment declared.',
  },
  titre: 'What you cover',
  aide: 'What you declare here will appear in the guarantee deed. You can correct it as long as the file has not been handed over.',
  revenu: 'Your net monthly income',
  profil: 'Your professional situation',
  profilInvalide: 'Choose one of the professional situations offered.',
  profilAide:
    'Save your situation to adapt the list of supporting documents. Income remains declared and will be compared with the documents by the agency.',
  revenuAide:
    'In euros, what you receive in total after tax withheld at source. The agency compares this declaration with your proof of income. If left empty, the file stays on hold.',
  couvre: 'You cover',
  couvreOptions: [
    { valeur: 'loyer_charges', libelle: 'The rent and the charges' },
    { valeur: 'loyer', libelle: 'The rent only' },
  ],
  montant: 'Maximum amount, in total',
  montantAide:
    'In euros, for the whole of your commitment. A maximum amount is needed to prepare your statement. Cents are accepted.',
  jusquAu: 'Until',
  jusquAuAide: 'Leave empty for the duration of the lease.',
  solidaire: 'Joint and several guarantee',
  solidaireAide:
    'The agency can ask you to pay from the first missed payment, without pursuing the tenant first. This is what almost every agency asks for.',
  bouton: 'Save',
  envoi: 'Saving…',
  succes: 'Your commitment has been saved.',
  avertissementLoyer: (loyer: string) =>
    `This amount is below the monthly rent for the file (${loyer} per month, charges included). You can still save it.`,
  erreurs: {
    couvre: 'Enter what you cover.',
    montant: 'The amount cannot be read. Example: 1 200 or 1200.50.',
    date: 'The end date must be in the future, in the format YYYY-MM-DD.',
    revenu: 'The income cannot be read. Example: 3 200 or 3200.50.',
  },
}

/**
 * La mention : guidee, jamais fournie. Aucune phrase modele ici non plus. Elle
 * s’ecrit en francais : c’est la langue de l’acte et du controle automatique.
 */
export const mention: Textes<typeof Fr.mention> = {
  titre: 'Your handwritten statement',
  figee: 'The file has been handed over: your statement is frozen. Here it is, as you wrote it.',
  intro:
    'You can prepare your statement before the file is handed over. This step is not a signature, and the automatic check does not certify that the text is legally valid. The statement is written in French, the language of the deed.',
  prenom: 'Your first name',
  nom: 'Your last name',
  adresse: 'Your address',
  elementsTitre: 'What your statement must contain',
  elements: {
    caution: 'That you commit yourself as guarantor (“caution”).',
    paiement: 'That you will pay the landlord if the tenant does not pay.',
    montant:
      'The maximum amount you guarantee, written twice: in figures and in words. Both must say the same thing.',
    solidarite:
      'As you chose a joint and several guarantee: that you waive the benefit of discussion and the benefit of division.',
  },
  elementsAide:
    'The wording is free. What matters is that these elements are there, in your own words.',
  champ: 'Your statement, written by you, in French',
  bouton: 'Record my statement',
  corriger: 'Correct my statement',
  envoi: 'Checking…',
  succes:
    'Statement saved. The elements detected automatically still have to be reviewed before signature.',
  manques: {
    caution: 'We cannot read that you commit yourself as guarantor (“caution”).',
    paiement: 'We cannot read that you will pay if the tenant defaults.',
    montant: 'We cannot find an amount written in figures and in words that match.',
    solidarite:
      'We cannot read the waiver of the benefits of discussion and division, required for a joint and several guarantee.',
  },
}

export const resteAFaire: Textes<typeof Fr.resteAFaire> = {
  titre: 'What you still need to do',
  aide: 'Each line takes you to the place on the page where you can complete it.',
  termine:
    'Everything we expect from you is there. The agency will review your documents; you can still correct them as long as the file has not been handed over.',
  attenteAgence:
    'Everything we expect from you is there. The tenant still has to link this file to an agency before it can be reviewed. You can still correct your documents until the file is handed over.',
  engagement: 'Enter what you cover, your net monthly income and a maximum amount.',
  complement: (nombre) =>
    nombre > 1
      ? `Replace the ${nombre} documents the agency asked you to upload again.`
      : 'Replace the document the agency asked you to upload again.',
  piece: (libelle, manque, attendu) =>
    attendu > 1
      ? `${libelle}: ${manque} document${manque > 1 ? 's' : ''} missing out of ${attendu}.`
      : `${libelle}: to upload.`,
  mention: 'Record your statement, written by you.',
}

export const lectureRevenus: Textes<typeof Fr.lectureRevenus> = {
  titre: 'Suggest my income from my documents',
  explication:
    'An AI reads the payslips and pension statement you have already uploaded, then suggests a net monthly income. Nothing is saved until you click Save.',
  accord:
    'I agree that these files are sent to OpenRouter and its AI provider, without retention, to read only the month and the net amount paid.',
  lancer: 'Read my documents',
  attente: 'Reading, this can take half a minute…',
  erreur: 'The reading did not succeed. You can still enter your income yourself.',
  quota: 'Too many readings in a short time. Try again in about ten minutes.',
  aucun: 'No net amount paid could be read. Please enter your income yourself.',
  proposition: (montant: string) => `Suggested income: €${montant} per month.`,
  salaire: (montant: string, mois: string) => `Average net salary paid (${mois}): €${montant}.`,
  pension: (montant: string, mois: string) => `Net pension paid (${mois}): €${montant}.`,
  variable:
    'Your salary varies by more than 20% from one month to the next: check that this average reflects your situation.',
  contradictoires: (mois: string) =>
    `Two different amounts were read for ${mois}: this month is not counted.`,
  illisibles: (n: number) =>
    n > 1 ? `${n} files could not be read.` : 'One file could not be read.',
  utiliser: 'Copy this amount into the field',
  reporte: 'Amount copied. Check it, then save.',
  verifier:
    'Compare this amount with your documents: the AI can make mistakes, and the agency will compare your declaration with your documents.',
}
