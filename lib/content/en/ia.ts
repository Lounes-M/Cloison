/** Le texte anglais de la page « Notre usage de l'IA ». La forme suit `lib/content/ia.ts`. */

import type { Textes } from '@/lib/i18n'
import type * as Fr from '../ia'

export const heroIa: Textes<typeof Fr.heroIa> = {
  eyebrow: 'How we use AI',
  titre: ['AI suggests.', 'You decide.', 'Every time.'],
  sousTitre:
    'At Cloison, an AI reads a document only when someone asks it to, for one precise task, and it saves nothing on your behalf. Here is exactly what it does, and what it will never do.',
  ancre: 'See what it does',
  description:
    'What AI does at Cloison, what it never does, and what guarantees it: reading on request, no automated decision, no retention.',
}

export const usages: Textes<typeof Fr.usages> = {
  titre: ['Two uses,', 'not one more.'],
  etat: { actif: 'Available', inactif: 'Not enabled yet' },
  items: [
    {
      cle: 'garant',
      pour: 'For the guarantor',
      titre: 'Finding the right income to declare',
      texte:
        'Gross, taxable net, net paid: a French payslip shows ten amounts and only one is the right one. On request, an AI reads the payslips and pension statement you have already uploaded, then suggests your net monthly income. You check it, copy it, and save.',
      points: [
        'It reads only the month and the net amount paid',
        'The average is calculated by Cloison, not by the AI',
        'Nothing is saved without your click',
      ],
    },
    {
      cle: 'agence',
      pour: 'For the agency',
      titre: 'Reviewing a document faster',
      texte:
        'A faint scan, a crooked photo, forty pages: on request, an AI transcribes the text of a supporting document the agency is already allowed to open. The transcription appears next to the document while it is being reviewed, then disappears.',
      points: [
        'A watermarked copy, never the original',
        'A text to compare with the document, not a verification',
        'Nothing is added to the file',
      ],
    },
  ],
}

export const deroule: Textes<typeof Fr.deroule> = {
  titre: ['Four steps,', 'all of them yours.'],
  etapes: [
    {
      numero: 1,
      titre: 'You ask',
      puce: 'Never by default',
      texte:
        'No document is read on upload, in the background or in bulk. Reading starts from a button, after a checkbox that says where the file goes.',
    },
    {
      numero: 2,
      titre: 'It reads the bare minimum',
      puce: 'One task, one answer',
      texte:
        'The expected answer is closed in advance. For an income: a month and an amount. If the AI returns anything else, a name or a number, the whole answer is rejected.',
    },
    {
      numero: 3,
      titre: 'You check',
      puce: 'It can be wrong',
      texte:
        'The suggestion is shown with the months read and the detail of the calculation. Two different amounts for the same month? It is set aside and flagged, not settled.',
    },
    {
      numero: 4,
      titre: 'You save',
      puce: 'Or not',
      texte:
        'Until you click Save, the file has not changed. The declared figure remains yours, and the agency still compares it with the documents.',
    },
  ],
}

export const jamais: Textes<typeof Fr.jamais> = {
  mot: 'never',
  titre: 'What AI will',
  cartes: [
    {
      label: 'Read an identity document',
      texte: 'The database refuses the request before the file is even opened.',
    },
    {
      label: 'Decide on a file',
      texte: 'No acceptance, no refusal, no status. Those are human decisions.',
    },
    {
      label: 'Score a person',
      texte: 'No score, no profile, no estimate of creditworthiness.',
    },
    {
      label: 'Write on your behalf',
      texte: 'Not your income, not your guarantee statement, not your signature.',
    },
  ],
  conclusion: ['The guarantor helps someone close.', 'They do not feed', 'an algorithm.'],
  texte:
    'The ratio is a division between a rent and a declared income. The documents are the evidence, and it is a person, at the agency, who looks at them.',
}

export const garanties: Textes<typeof Fr.garanties> = {
  titre: ['What guarantees it,', 'in practice.'],
  sousTitre:
    'These rules are not intentions: they are written in the code and in the database, and checked by tests on every change.',
  items: [
    {
      cle: 'conservation',
      titre: 'Zero retention',
      libelle:
        'Every request requires a provider that keeps neither the file nor the answer, and does not use them to train a model. Otherwise, the request is not sent.',
    },
    {
      cle: 'europe',
      titre: 'Read in Europe',
      libelle:
        'Income reading is entrusted to a server located in Europe, required on every request, with no fallback to another.',
    },
    {
      cle: 'journal',
      titre: 'Logged in the history',
      libelle:
        'Every reading request adds a line to the file’s history, before the file is opened. The guarantor sees it in their space.',
    },
    {
      cle: 'ephemere',
      titre: 'Nothing is kept',
      libelle:
        'Neither the transcription nor the suggestion is saved, at Cloison or in your browser. Close the page: they no longer exist.',
    },
    {
      cle: 'quota',
      titre: 'A bounded use',
      libelle:
        'A few readings per file every ten minutes, no more. An AI cannot go through files in bulk.',
    },
    {
      cle: 'facultatif',
      titre: 'Always optional',
      libelle:
        'The file can be completed entirely without AI. Not using it changes neither the timing nor the agency’s review.',
    },
  ],
}

export const suiteIa: Textes<typeof Fr.suiteIa> = {
  titre: ['A question', 'about your data?'],
  texte:
    'The privacy policy names the provider that receives the files, and the frequently asked questions say who sees what.',
  liens: [
    { label: 'Read the privacy policy', href: '/confidentialite' },
    { label: 'Frequently asked questions', href: '/questions' },
  ],
  cta: 'Create my file',
}
