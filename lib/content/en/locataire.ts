import type { Textes } from '@/lib/i18n'
import type * as Fr from '../locataire'

/** Ce que le locataire lit, en anglais. Il apprend ou en est son dossier, jamais pourquoi. */
export const porte: Textes<typeof Fr.porte> = {
  titre: 'Create your file',
  sousTitre:
    'One email address, and you get a link. No account, no password: the link is your key.',
  champ: 'Your email address',
  exemple: 'you@example.com',
  aide: 'Your link will arrive by email. Check your spam folder too.',
  bouton: 'Open my file',
  envoi: 'Opening…',
  succesTitre: 'Check your inbox.',
  succesTexte:
    'If the request could be processed, you will receive a link valid for seven days. Keep it to find your file again.',
}

export const secondGarant: Textes<typeof Fr.secondGarant> = {
  titre: 'A second guarantor',
  aide: 'If one guarantor is not enough, you can add a second one. Their income is added to the first guarantor’s, and each uploads their documents separately, without seeing the other’s.',
  designe: (email) => `Second guarantor named: ${email}. They upload their documents separately.`,
  champ: 'Their email address',
  bouton: 'Send the link to the second guarantor',
  renvoyer: 'Resend their link',
  envoi: 'Sending…',
  succes:
    'The link is scheduled to be sent. The file now waits for the documents of both guarantors.',
  erreurs: {
    adresse: 'This does not look like an email address.',
    doublon: 'The second guarantor must be someone other than you and your first guarantor.',
    refus: 'This file cannot take a second guarantor for now.',
    debit: 'Too many links sent. Try again in fifteen minutes.',
    expire: 'Your link has expired. Request a new one.',
  },
}

export const espace: Textes<typeof Fr.espace> = {
  loyerFige: 'Rent:',
  loyerFigeSuite: '€. This amount is locked to keep the guarantor’s declaration confidential.',
  garantAssocie:
    'The invited guarantor stays attached to this file. To name someone else, open a new file.',
  plusModifiable: 'This file can no longer be changed.',
  garantRenouvellement:
    'You can resend access to the same guarantor. The file stays frozen and the new link replaces the previous one.',
  titre: 'Your file',
  reference: 'Reference',
  garantTitre: 'Your guarantor',
  garantAucun:
    'You have not named a guarantor yet. They are the one who uploads the documents, on their side.',
  garantDesigne: (email) => `Guarantor named: ${email}. They upload their documents separately.`,
  garantChamp: 'Their email address',
  garantAide:
    'They receive a link to upload their documents. You will never see what they upload, only that the file is moving forward.',
  garantBouton: 'Send the link to my guarantor',
  garantRenvoyer: 'Resend the link',
  garantEnvoi: 'Sending…',
  garantSucces: 'The link is scheduled to be sent. It stays valid only as long as the file.',
  expire: (date) => `This file expires on ${date}.`,
  loyerTitre: 'The rent',
  loyerAide:
    'Charges included, per month. It is used to establish whether your guarantor is suitable: without it, the file stays on hold. The rent is frozen once the guarantor has made their declaration.',
  loyerChamp: 'Monthly rent, charges included',
  loyerBouton: 'Save',
  loyerEnvoi: 'Saving…',
  loyerSucces: 'Rent saved.',
}

export const resteAFaire: Textes<typeof Fr.resteAFaire> = {
  titre: 'What you still need to do',
  aide: 'Each line takes you to the place on the page where you can do it.',
  etapes: {
    loyer: 'Enter the monthly rent, charges included.',
    paiement: 'Pay for the file so your guarantor receives their link.',
    garant: 'Name your guarantor: they receive a link to upload their documents.',
  },
  attente:
    'Nothing to do on your side for now. Your guarantor is uploading their documents; you will see the file move forward here.',
}

export const statuts: Textes<typeof Fr.statuts> = {
  ouvert: {
    libelle: 'File opened',
    explication: 'Waiting for your guarantor. Name them below so they receive their link.',
    ton: 'sky',
  },
  depot_en_cours: {
    libelle: 'Upload in progress',
    explication:
      'Your guarantor has started uploading their documents. Nothing to do on your side.',
    ton: 'sun',
  },
  complet: {
    libelle: 'File complete',
    explication: 'All the documents are there. Your guarantor is eligible: the agency can decide.',
    ton: 'mint',
  },
  garant_insuffisant: {
    libelle: 'This guarantor is not suitable',
    explication:
      'Contact your agency about what comes next. This guarantor’s data stays in their own file.',
    ton: 'flame',
  },
  transmis: {
    libelle: 'With the agency',
    explication: 'The agency has received the file. It will get back to you.',
    ton: 'mint',
  },
  signe: {
    libelle: 'Deed signed',
    explication: 'Your guarantor has signed. The file is complete.',
    ton: 'mint',
  },
  refuse: {
    libelle: 'File declined',
    explication: 'The agency did not select this file.',
    ton: 'flame',
  },
  expire: {
    libelle: 'File expired',
    explication: 'This file has reached its deadline. You can open a new one.',
    ton: 'paper',
  },
}

export const lienInvalide: Textes<typeof Fr.lienInvalide> = {
  titre: 'This link no longer works',
  texte:
    'It has expired, been revoked or been replaced by a more recent one. Only one link is valid at a time.',
  locataire: 'If you are a tenant, open a new file or request a new link.',
  garant: 'Without the reference, the tenant can also resend you the link from their file.',
  bouton: 'Open a file',
}
