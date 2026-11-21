/** Le texte anglais de la page /agences. La forme suit `lib/content/agences.ts`. */

import { prixActe } from './tarifs'

export const heroAgences = {
  eyebrow: 'For agencies',
  titre: ['The guarantee reaches you', 'complete.', 'Or not at all.'],
  sousTitre:
    'The guarantor’s documents are gathered in a separate space. You view them watermarked, with a ratio calculated from the declared income. You remain responsible for reviewing them.',
  ancreFormulaire: 'Request a demo',
  description:
    'Cloison gathers the guarantor’s documents in a separate space and hands your agency a complete, watermarked rental guarantee file.',
} as const

export const douleurs = {
  titre: ['What it costs you', 'today'],
  items: [
    {
      titre: 'Documents arriving from everywhere',
      texte:
        'By email, by WhatsApp, as a crooked photo, sometimes from the tenant forwarding their uncle’s. Someone on your team gathers them by hand.',
    },
    {
      titre: 'A guarantee deed to redo',
      texte:
        'Printed, filled in wrong, scanned again. Every round trip costs days on a property that stays empty.',
    },
    {
      titre: 'A doubt nobody settles',
      texte:
        'Can the guarantor really afford it? The sum is done in your head, in a rush, on documents nobody has time to check.',
    },
  ],
} as const

export const cequonapporte = {
  titre: ['One link.', 'It’s all inside.'],
  items: [
    {
      ton: 'sun',
      titre: 'Documents in one place',
      texte:
        'The guarantor uploads them personally, at home, in their own space. You receive nothing until the file is complete.',
    },
    {
      ton: 'mint',
      titre: 'A ratio already calculated',
      texte:
        'The ratio uses the income declared by the guarantor and the rent of the file. It does not replace your own check of the supporting documents.',
    },
    {
      ton: 'sky',
      titre: 'A deed signed and archived',
      texte:
        'The guarantee deed is signed online, then archived with its proof, apart from the supporting documents.',
    },
  ],
  garantie: {
    titre: 'And the documents stay watermarked',
    texte:
      'You see what you need to decide, in a format that commits you not to pass it on. Every viewing leaves a trace.',
  },
} as const

export const commentCaMarche = {
  titre: ['Three steps,', 'each in their own space'],
  etapes: [
    {
      numero: 1,
      puce: 'no account',
      titre: 'You send the tenant a link',
      texte:
        'From the tool you already use. No account to create, for them or for their guarantor.',
    },
    {
      numero: 2,
      puce: 'partitioned',
      titre: 'The guarantor uploads their documents',
      texte:
        'Alone, at home. The tenant follows the progress without ever seeing the documents or the amounts.',
    },
    {
      numero: 3,
      puce: 'to review',
      titre: 'You receive a complete file',
      texte:
        'View the watermarked documents and the declared ratio in your agency space, then make your decision.',
    },
  ],
} as const

export const tarifAgence = {
  titre: ['What Cloison', 'will', 'charge you'],
  regleOr:
    'The guarantor never pays anything, under any circumstances. That is the rule that gets the file all the way through.',
  lignes: [
    { libelle: 'Viewing a file', valeur: 'Free', ton: 'vert' },
    { libelle: 'Per signed and archived deed', valeur: prixActe },
    { libelle: 'Minimum commitment', valeur: 'None' },
  ],
  total: { libelle: 'The guarantor', valeur: '€0' },
} as const

export const formulaire = {
  eyebrow: 'Demo',
  titre: ['See it on', 'a real file.'],
  sousTitre:
    'We walk you through the full journey on a real file, then support you on your first files.',
  metriques: [
    { valeur: '3', libelle: 'separate spaces' },
    { valeur: '7', libelle: 'days per link' },
    { valeur: '3', libelle: 'months of retention' },
  ],
} as const
