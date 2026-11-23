/**
 * Le texte anglais de la page d'accueil. La forme suit `lib/content/home.ts` :
 * une cle ajoutee la-bas doit l'etre ici.
 */

import { commentCaMarche } from './agences'
import { prixActe, prixLocataire } from './tarifs'

export const hero = {
  eyebrow: 'Three spaces',
  /** Le titre en trois morceaux, celui du milieu en couleur. */
  titre: [
    'Your guarantor is helping you. They do not owe you',
    'their payslip',
    ', or a blind signature.',
  ],
  subtitle:
    'You create your file, your guarantor uploads their documents on their side, and the agency receives a complete file. Nobody sees what they should not see.',
  primaryCta: 'Create my file',
  secondaryCta: 'I am an agency',
} as const

export const marqueeItems = [
  'Three awkward people',
  'Zero process',
  'Documents lying around everywhere',
  'Never again',
] as const

export const problem = {
  titre: 'Someone close backs your lease.',
  sousTitre: 'Their papers go everywhere.',
  body: 'Their payslips on your WhatsApp. Their tax notice in your Drive. A printed deed, filled in wrong, scanned again. Helping someone rent a home should not look like this.',
  suite: {
    titre: 'Three awkward people.',
    texte:
      'Zero process, and sensitive documents lying around everywhere. Cloison gives everyone their own space, and nobody the documents of others.',
  },
} as const

export const spaces = [
  {
    id: 'locataire',
    step: 1,
    title: 'The tenant',
    tone: 'mint',
    icone: 'acte',
    body: 'They create the file and invite their guarantor. They follow the progress of the file, without seeing the documents or the amounts.',
    footnote: { left: 'File progress', live: true },
  },
  {
    id: 'garant',
    step: 2,
    title: 'The guarantor',
    tone: 'sun',
    icone: 'cadenas',
    body: 'They receive a link and upload their documents alone, at home. They see what they cover, how much, and until when.',
    footnote: { left: 'Covers: rent + charges', iconeDroite: 'cadenas' },
  },
  {
    id: 'agence',
    step: 3,
    title: 'The agency',
    tone: 'sky',
    icone: 'fichier',
    body: 'It signs in to its space: watermarked documents and a ratio calculated from the declared income. It reviews the file before deciding.',
    footnote: { left: 'Watermarked documents', right: 'Ratio calculated', iconeDroite: 'coche' },
  },
] as const

export const parcours = {
  eyebrow: 'How it works',
  headline: ['Three steps,', 'each in their own space.'],
  legende: 'Where do you start?',
  pistes: [
    {
      id: 'locataire',
      onglet: 'I am looking for a home',
      etapes: [
        {
          numero: 1,
          puce: 'zero paper',
          titre: 'You create your file',
          texte:
            'Two minutes, and you name the person who will back your lease. Nothing to scan, nothing to print.',
        },
        {
          numero: 2,
          puce: 'private upload',
          titre: 'Your guarantor gets a link',
          texte:
            'They upload their documents on their side, at home. You see how far along they are, never what they send.',
        },
        {
          numero: 3,
          puce: 'to review',
          titre: 'You send it to the agency',
          texte:
            'The agency views the watermarked documents and the declared ratio. It remains responsible for reviewing the file.',
        },
      ],
      cta: { label: 'Create my file', href: '/demarrer' },
    },
    {
      id: 'agence',
      onglet: 'I am an agency',
      etapes: commentCaMarche.etapes,
      cta: { label: 'What it changes for you', href: '/agences' },
    },
  ],
} as const

export const product = {
  headline: ['To each their view.', 'Nothing else.'],
  intro:
    'Three separate spaces to prepare the guarantee file, pass on the documents and review the application.',
  outro: 'One file, three ways in. Every time a document is viewed, it leaves a trace.',
  outroHighlight: 'Nothing leaves its space.',
} as const

export const pricing = {
  headline: ['Who pays', 'what?'],
  plans: [
    {
      audience: 'The tenant',
      price: prixLocataire,
      detail: 'once, for a file valid for three months. Free when your agency invites you.',
    },
    {
      audience: 'The agency',
      price: prixActe,
      detail: 'per signed and archived deed. Reading files stays free.',
    },
  ],
  goldenRule: {
    tag: 'Golden rule',
    audience: 'The guarantor',
    price: 'Nothing.',
    detail: 'The guarantor never pays, at any step.',
  },
} as const

export const whyNow = {
  eyebrow: 'Why now?',
  body: 'A guarantor’s documents still travel between several people and several tools.',
  emphasis: 'The guarantor needs a space of their own.',
} as const

export const goToMarket = {
  eyebrow: 'Cloison in numbers',
  metrics: [
    { value: '3', label: 'separate spaces' },
    { value: '7', label: 'days of validity per link' },
    { value: '3', label: 'months of retention' },
  ],
} as const

export const vision = {
  headline: ['Renting is the first case.', 'The product is', 'the three-key vault.'],
  body: 'Someone commits for you without showing you their papers. Same awkwardness, same need, same vault.',
  useCases: [
    {
      label: 'Bank guarantee',
      texte: 'Back a loan without showing your accounts to everyone.',
    },
    {
      label: 'Host for a visa',
      texte: 'Confirm accommodation by uploading your documents just once.',
    },
    {
      label: 'Parents for student housing',
      texte: 'Support a student’s application without handing over your papers.',
    },
    {
      label: 'Grandparents for nursery',
      texte: 'Help secure a place while keeping your documents to yourself.',
    },
  ],
  cta: 'Create my file',
} as const

export const productViews = {
  choisir: 'Change your point of view',
  exemple: 'Illustration',
  separation: 'One file. Separate access, so that everyone keeps their place.',
  roles: [
    'Follow, without seeing it all.',
    'Commit, knowing what it means.',
    'Review, with the right facts.',
  ],
  apercus: {
    locataire: {
      espace: 'Tenant space',
      repere: 'Progress, made simple',
      titre: 'Your file is moving.',
      lignes: [
        { label: 'Your file', valeur: 'Created' },
        { label: 'Your guarantor', valeur: 'Invited' },
        { label: 'The agency', valeur: 'Review to come' },
      ],
      frontiere: 'The guarantor’s documents and amounts stay out of your sight.',
    },
    garant: {
      espace: 'Guarantor space',
      repere: 'A space of your own',
      titre: 'Your commitment, spelled out.',
      lignes: [
        { label: 'What you cover', valeur: 'Rent + charges' },
        { label: 'Maximum amount', valeur: 'Set in your commitment' },
        { label: 'End date', valeur: 'Fixed in your commitment' },
      ],
      frontiere: 'You upload your documents directly, without going through the tenant.',
    },
    agence: {
      espace: 'Agency space',
      repere: 'What you need to review',
      titre: 'The decision stays yours.',
      lignes: [
        { label: 'Supporting documents', valeur: 'Watermarked viewing' },
        { label: 'Ratio', valeur: 'Declared income / rent' },
        { label: 'Review', valeur: 'Human decision' },
      ],
      frontiere: 'Authorised access, and a trace of every document viewed.',
    },
  },
} as const

export const espacesAccueil = {
  aria: 'The three spaces',
  etape: 'Step',
  liens: [
    { href: '/demarrer', libelle: 'Create my file' },
    { href: '/questions', libelle: 'Guarantor questions' },
    { href: '/agences', libelle: 'I am an agency' },
  ],
} as const
