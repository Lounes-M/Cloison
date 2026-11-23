/**
 * Tout le texte de la page d'accueil.
 * Le contenu vit ici, la mise en forme vit dans `components/sections/`.
 * Pour changer une accroche, on n'ouvre pas un composant.
 */

import { commentCaMarche } from './agences'
import { prixLocataire, prixActe } from './tarifs'

export const hero = {
  eyebrow: 'Trois espaces',
  /** Le titre en trois morceaux, celui du milieu en couleur. */
  titre: [
    'Ton garant t\u2019aide. Il ne te doit',
    'ni sa fiche de paie',
    ', ni une signature à l\u2019aveugle.',
  ],
  badges: [
    { label: 'accès par lien', tone: 'sun', position: 'top-[70px] left-[6%]', tilt: -8, delay: 0 },
    {
      label: 'pas de papier',
      tone: 'mint',
      position: 'top-[200px] left-[3%]',
      tilt: 5,
      delay: 0.8,
    },
    {
      label: 'espaces séparés',
      tone: 'sky',
      position: 'top-[100px] right-[5%]',
      tilt: 6,
      delay: 0.4,
    },
  ],
  liveBadge: {
    label: 'pièces protégées',
    position: 'top-[240px] right-[8%]',
    tilt: -5,
    delay: 1.2,
  },
  subtitle:
    "Tu crées ton dossier, ton garant dépose ses pièces de son côté, l'agence reçoit un dossier complet. Personne ne voit ce qu'il ne doit pas voir.",
  primaryCta: 'Créer mon dossier',
  secondaryCta: 'Je suis une agence',
} as const

export const marqueeItems = [
  'Trois personnes gênées',
  'Zéro processus',
  'Des documents qui traînent partout',
  'Plus jamais ça',
] as const

/**
 * La section rose sous le hero : un titre, sa suite, le constat, puis un
 * second temps plus court.
 */
export const problem = {
  titre: 'Un proche se porte caution.',
  sousTitre: 'Ses papiers font le tour.',
  body: "Ses bulletins de paie sur ton WhatsApp. Son avis d'imposition dans ton Drive. Un acte imprimé, mal rempli, rescanné. Aider un proche à louer ne devrait pas ressembler à ça.",
  suite: {
    titre: 'Trois personnes gênées.',
    texte:
      'Zéro processus, et des documents sensibles qui traînent partout. Cloison donne à chacun son espace, et à personne les pièces des autres.',
  },
} as const

/**
 * Les trois espaces cloisonnés : le cœur du produit.
 *
 * L'ordre suit le parcours réel : le locataire ouvre le dossier, le garant
 * dépose, l'agence décide. Changer cet ordre, c'est changer le produit.
 */
export const spaces = [
  {
    id: 'locataire',
    step: 1,
    title: 'Le locataire',
    tone: 'mint',
    icone: 'acte',
    body: "Il crée le dossier et invite son garant. Il suit l'avancement du dossier, sans voir les pièces ni les montants.",
    footnote: { left: 'Avancement du dossier', live: true },
  },
  {
    id: 'garant',
    step: 2,
    title: 'Le garant',
    tone: 'sun',
    icone: 'cadenas',
    body: 'Il reçoit un lien et dépose ses pièces seul, chez lui. Il voit ce qu\u2019il couvre, combien, jusqu\u2019à quand.',
    footnote: { left: 'Couvre : loyer + charges', iconeDroite: 'cadenas' },
  },
  {
    id: 'agence',
    step: 3,
    title: "L'agence",
    tone: 'sky',
    icone: 'fichier',
    body: 'Elle se connecte à son espace : pièces filigranées et ratio calculé à partir du revenu déclaré. Elle examine le dossier avant de décider.',
    footnote: { left: 'Pièces filigranées', right: 'Ratio calculé', iconeDroite: 'coche' },
  },
] as const

/**
 * Les deux portes d'entrée du produit.
 *
 * Le locataire d'abord, et l'ordre n'est pas cosmétique : c'est lui qui a le
 * problème, c'est lui qui relancera son garant, et c'est le seul dont la
 * motivation ne retombe pas. La porte agence existe en parallèle : elle sert
 * l'agence qui préfère lancer le dossier elle-même.
 *
 * Les étapes agence sont reprises de `agences.ts` plutôt que recopiées : deux
 * descriptions du même parcours finiraient par diverger, et c'est la page
 * agences qui fait foi.
 */
export const parcours = {
  eyebrow: 'Comment ça marche',
  headline: ['Trois étapes,', 'chacun son espace.'],
  /** Lu par les lecteurs d'écran à la place du groupe d'onglets. */
  legende: 'Par où commences-tu\u00a0?',
  pistes: [
    {
      id: 'locataire',
      onglet: 'Je cherche un logement',
      etapes: [
        {
          numero: 1,
          puce: 'zéro papier',
          titre: 'Tu crées ton dossier',
          texte:
            'Deux minutes, et tu désignes qui se porte caution pour toi. Rien à scanner, rien à imprimer.',
        },
        {
          numero: 2,
          puce: 'dépôt privé',
          titre: 'Ton garant reçoit un lien',
          texte:
            "Il dépose ses pièces de son côté, chez lui. Tu vois où il en est, jamais ce qu'il envoie.",
        },
        {
          numero: 3,
          puce: 'à examiner',
          titre: "Tu transmets à l'agence",
          texte:
            "L'agence consulte les pièces filigranées et le ratio déclaré. Elle reste responsable de l'examen du dossier.",
        },
      ],
      cta: { label: 'Créer mon dossier', href: '/demarrer' },
    },
    {
      id: 'agence',
      onglet: 'Je suis une agence',
      etapes: commentCaMarche.etapes,
      cta: { label: 'Ce que ça change pour vous', href: '/agences' },
    },
  ],
} as const

export const product = {
  headline: ['Chacun sa vue.', "Rien d'autre."],
  intro:
    'Trois espaces séparés pour préparer le dossier de caution, transmettre les pièces et examiner la demande.',
  outro: 'Un même dossier, trois accès. Chaque consultation de pièce laisse une trace.',
  outroHighlight: 'Rien ne sort de son espace.',
} as const
export const pricing = {
  headline: ['Qui paie', 'quoi ?'],
  plans: [
    {
      audience: 'Le locataire',
      price: prixLocataire,
      detail: 'une fois, pour un dossier valable trois mois. Gratuit quand ton agence t’invite.',
    },
    {
      audience: "L'agence",
      price: prixActe,
      detail: 'par acte signé et archivé. Consulter les dossiers reste gratuit.',
    },
  ],
  goldenRule: {
    tag: "Règle d'or",
    audience: 'Le garant',
    price: 'Rien.',
    detail: 'Le garant ne paie jamais, à aucune étape.',
  },
} as const

export const whyNow = {
  eyebrow: 'Pourquoi maintenant\u00a0?',
  body: 'Les pièces du garant circulent encore entre plusieurs personnes et plusieurs outils.',
  emphasis: 'Le garant a besoin de son propre espace.',
} as const

export const goToMarket = {
  eyebrow: 'Cloison en chiffres',
  metrics: [
    { value: '3', label: 'espaces séparés' },
    { value: '7', label: 'jours de validité par lien' },
    { value: '3', label: 'mois de conservation' },
  ],
} as const

export const vision = {
  headline: [
    'La location, c\u2019est le premier cas.',
    'Le produit, c\u2019est',
    'le coffre à trois clés.',
  ],
  body: "Quelqu'un s'engage pour toi sans te montrer ses papiers. Même gêne, même besoin, même coffre.",
  useCases: [
    {
      label: 'Caution bancaire',
      texte: 'Garantir un prêt sans montrer ses comptes à tout le monde.',
    },
    {
      label: 'Hébergeant pour un visa',
      texte: 'Attester d’un hébergement en déposant ses pièces une seule fois.',
    },
    {
      label: 'Parents pour le Crous',
      texte: 'Appuyer le dossier d’un étudiant sans lui confier ses papiers.',
    },
    {
      label: 'Grands-parents pour la crèche',
      texte: 'Aider pour une place en gardant ses documents pour soi.',
    },
  ],
  cta: 'Créer mon dossier',
} as const

export const productViews = {
  choisir: 'Change de point de vue',
  exemple: 'Illustration',
  separation: 'Un même dossier. Des accès distincts, pour que chaque personne garde sa place.',
  roles: [
    'Suivre, sans tout voir.',
    'S’engager, en connaissance de cause.',
    'Examiner, avec les bons éléments.',
  ],
  apercus: {
    locataire: {
      espace: 'Espace locataire',
      repere: 'Le suivi, simplement',
      titre: 'Ton dossier avance.',
      lignes: [
        { label: 'Ton dossier', valeur: 'Créé' },
        { label: 'Ton garant', valeur: 'Invité' },
        { label: 'L’agence', valeur: 'Examen à venir' },
      ],
      frontiere: 'Les pièces et les montants du garant restent hors de ta vue.',
    },
    garant: {
      espace: 'Espace garant',
      repere: 'Un espace à toi',
      titre: 'Ton engagement, en clair.',
      lignes: [
        { label: 'Ce que tu couvres', valeur: 'Loyer + charges' },
        { label: 'Montant maximum', valeur: 'Défini dans ton engagement' },
        { label: 'Date de fin', valeur: 'Fixée dans ton engagement' },
      ],
      frontiere: 'Tu déposes tes pièces directement, sans passer par le locataire.',
    },
    agence: {
      espace: 'Espace agence',
      repere: 'Les éléments pour examiner',
      titre: 'Vous gardez la décision.',
      lignes: [
        { label: 'Justificatifs', valeur: 'Consultation filigranée' },
        { label: 'Ratio', valeur: 'Revenu déclaré / loyer' },
        { label: 'Examen', valeur: 'Décision humaine' },
      ],
      frontiere: 'Un accès autorisé et une trace de chaque consultation documentaire.',
    },
  },
} as const

/** Les libelles de la section des trois espaces empiles. */
export const espacesAccueil = {
  aria: 'Les trois espaces',
  etape: 'Étape',
  liens: [
    { href: '/demarrer', libelle: 'Créer mon dossier' },
    { href: '/questions', libelle: 'Les questions du garant' },
    { href: '/agences', libelle: 'Je suis une agence' },
  ],
} as const
