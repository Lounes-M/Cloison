/** Les questions frequentes en anglais. La forme suit `lib/content/questions.ts`. */

import { prixActe, prixLocataire } from './tarifs'

export const questions = {
  titre: 'Frequently asked questions',
  description:
    'Price, confidentiality of documents, retention period, access links: answers to the questions of tenants, guarantors and agencies.',
  introduction:
    'Short answers to the questions we are asked most. The terms and the privacy policy are the reference for the detail.',
  sommaire: 'Go to the questions',
  liste: ['What we are asked', 'most'],
  groupes: [
    {
      id: 'locataire',
      titre: 'I am looking for a home',
      questions: [
        {
          question: 'How much does it cost?',
          reponse: `${prixLocataire}, once, for a file you open yourself, valid for three months. It is free when your agency invites you, with a link or from its listing. The agency pays ${prixActe} per signed and archived deed. The guarantor pays nothing. You can withdraw within fourteen days: you are then refunded, minus the share of the three months already elapsed.`,
        },
        {
          question: 'Can I see my guarantor’s documents?',
          reponse:
            'No. You follow the progress of the file, never the documents or the amounts. The database itself forbids it, not just the screen.',
        },
        {
          question: 'My guarantor did not get their link, or it has expired.',
          reponse:
            'A link is valid for seven days at most. You can send it again from your space: the new link replaces the previous one, which stops working.',
        },
        {
          question: 'Can I have two guarantors?',
          reponse:
            'Yes, when your file is followed by an agency. You then name a second guarantor from your space. Each one uploads their documents on their side, without seeing the other’s, and the agency assesses the two together.',
        },
        {
          question: 'I lost the link to my file.',
          reponse:
            'Use “Find my file” with your address and the reference you received by email: if the file is still active, a new link is sent to you.',
        },
      ],
    },
    {
      id: 'garant',
      titre: 'I am acting as guarantor',
      questions: [
        {
          question: 'Do I pay anything?',
          reponse: `Never. The guarantor pays nothing, at any stage. The tenant pays ${prixLocataire} when they open the file themselves, and the agency pays ${prixActe} per signed and archived deed.`,
        },
        {
          question: 'Who sees my documents?',
          reponse:
            'The agency attached to your file sees watermarked copies, and every viewing is recorded under its name. The tenant sees neither your documents nor your amounts.',
          complements: {
            lectureGarant:
              'If you ask for it yourself, an AI reads your payslips or pension statement to suggest an income, without keeping them.',
            ocr: 'If the agency asks for it, a document other than your identity document can be read by a text recognition service to make it easier to review.',
          },
        },
        {
          question: 'How long are they kept?',
          reponse:
            'Three months at most after the file is opened. If the agency closes the file earlier, access is cut immediately and the data goes in the next purge.',
        },
        {
          question: 'My link no longer works.',
          reponse:
            'Only one link is valid at a time, for seven days at most. Use “Find my file” with your address and the reference you received in the invitation: if the file is still active, a new link is sent to you. The tenant can also send it again from their file.',
        },
        {
          question: 'Are my documents protected?',
          reponse:
            'They are encrypted before being stored, with a key specific to the file. You get your originals back exactly as they were; the watermark only applies to the copies shown to the agency.',
        },
      ],
    },
    {
      id: 'agence',
      titre: 'I am an agency',
      questions: [
        {
          question: 'How much does it cost?',
          reponse: `Viewing files is free. ${prixActe} per signed and archived deed. The tenant pays ${prixLocataire} only if they open the file themselves; the guarantor pays nothing.`,
        },
        {
          question: 'How do my colleagues join the space?',
          reponse:
            'With an address on your agency’s domain, then the approval of an administrator. Two-factor authentication is mandatory for everyone.',
        },
        {
          question: 'A colleague has lost their phone.',
          reponse:
            'An administrator resets their two-factor authentication from the team page. They set up a new one the next time they sign in.',
        },
        {
          question: 'The applicant has withdrawn, or the home has been let.',
          reponse:
            'You can close the file before it expires: everyone’s access is cut immediately and the encryption key for the documents is destroyed.',
        },
      ],
    },
  ],
} as const
