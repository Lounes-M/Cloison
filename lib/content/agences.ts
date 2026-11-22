/**
 * Le texte de la page /agences.
 *
 * L'angle diffère volontairement de la page d'accueil : celle-ci parle de la
 * gêne du locataire et de son garant, celle-là parle du temps que l'agence
 * perd. Même produit, acheteur différent.
 */

import { prixActe } from './tarifs'

export const heroAgences = {
  eyebrow: 'Pour les agences',
  titre: ['La caution vous arrive', 'complète.', 'Ou pas du tout.'],
  sousTitre:
    'Les pièces du garant sont réunies dans un espace séparé. Vous les consultez filigranées, avec un ratio calculé à partir du revenu déclaré. Vous restez responsable de leur examen.',
  ancreFormulaire: 'Demander une démonstration',
} as const

export const douleurs = {
  titre: ['Ce que ça vous coûte', 'aujourd’hui'],
  items: [
    {
      titre: 'Des pièces qui arrivent de partout',
      texte:
        "Par mail, par WhatsApp, en photo de travers, parfois par le locataire qui transfère celles de son oncle. Quelqu'un chez vous les rassemble à la main.",
      tampon: '5 canaux',
    },
    {
      titre: 'Un acte de cautionnement à reprendre',
      texte:
        'Imprimé, mal rempli, rescanné. Chaque aller-retour coûte des jours sur un bien qui reste vide.',
      tampon: 'À refaire',
    },
    {
      titre: 'Un doute que personne ne lève',
      texte:
        "Le garant est-il réellement solvable ? Le calcul se fait de tête, dans l'urgence, sur des documents qu'on n'a pas le temps de vérifier.",
      tampon: 'Solvable ?',
    },
  ],
} as const

export const cequonapporte = {
  titre: ['Un lien.', 'Tout est dedans.'],
  items: [
    {
      ton: 'sun',
      titre: 'Des pièces réunies',
      texte:
        "Le garant dépose lui-même, chez lui, sur son espace. Vous ne recevez rien tant que le dossier n'est pas complet.",
    },
    {
      ton: 'mint',
      titre: 'Un ratio déjà calculé',
      texte:
        'Le ratio utilise le revenu déclaré par le garant et le loyer du dossier. Il ne remplace pas votre vérification des justificatifs.',
    },
    {
      ton: 'sky',
      titre: 'Un acte signé et archivé',
      texte:
        'L’acte de cautionnement se signe en ligne, puis s’archive avec sa preuve, à part des justificatifs.',
    },
  ],
  /**
   * Remplace la troisième carte tant que la signature en ligne n’est pas
   * ouverte (SIGNATURE_PARCOURS_ENABLED) : le site ne promet que ce qui marche.
   */
  acteAVenir: {
    ton: 'sky',
    titre: 'Un acte prêt à signer',
    texte:
      'Le projet d’acte de cautionnement se prépare depuis le dossier, avec la mention écrite par le garant. La signature en ligne et l’archivage avec sa preuve ouvrent bientôt.',
  },
  garantie: {
    titre: 'Et les pièces restent filigranées',
    texte:
      "Vous voyez ce qu'il faut pour décider, dans un format qui vous engage à ne pas le diffuser. Chaque consultation laisse une trace.",
  },
} as const

/**
 * Les trois étapes du parcours agence.
 *
 * `etapes` est aussi lu par `home.ts` pour la piste agence de la section
 * « Comment ça marche » : deux descriptions du même parcours finiraient par
 * diverger, et c'est cette page qui fait foi. Sa forme (numéro, puce, titre,
 * texte) ne change donc pas sans regarder l'autre usage.
 */
export const commentCaMarche = {
  titre: ['Trois étapes,', 'chacun son espace'],
  etapes: [
    {
      numero: 1,
      puce: 'aucun compte',
      titre: 'Vous envoyez un lien au locataire',
      texte: 'Depuis votre outil habituel. Aucun compte à créer, ni pour lui, ni pour son garant.',
    },
    {
      numero: 2,
      puce: 'cloisonné',
      titre: 'Le garant dépose ses pièces',
      texte:
        "Seul, chez lui. Le locataire suit l'avancement sans jamais voir les documents ni les montants.",
    },
    {
      numero: 3,
      puce: 'à examiner',
      titre: 'Vous recevez un dossier complet',
      texte:
        'Consultez les pièces filigranées et le ratio déclaré dans votre espace agence, puis prenez votre décision.',
    },
  ],
} as const

/**
 * Le tarif, présenté en ticket de caisse.
 *
 * La forme dit ce que le tableau ne disait pas : il n'y a pas de ligne cachée,
 * et la dernière ligne est un zéro.
 */
export const tarifAgence = {
  titre: ['Ce que Cloison', 'vous', 'facture'],
  regleOr:
    "Le garant ne paie jamais rien, dans aucun cas. C'est la règle qui fait que le dossier avance jusqu'au bout.",
  tampon: 'Sans surprise',
  entete: 'tarif agences',
  lignes: [
    { libelle: 'Consulter un dossier', valeur: 'Gratuit', ton: 'vert' },
    { libelle: 'Par acte signé et archivé', valeur: prixActe },
    { libelle: 'Engagement de durée', valeur: 'Aucun' },
  ],
  total: { libelle: 'Le garant', valeur: '0 €' },
} as const

export const formulaire = {
  eyebrow: 'Démonstration',
  titre: ['Voyez-le sur', 'un dossier réel.'],
  sousTitre:
    'Nous vous montrons le parcours complet sur un dossier réel, puis nous vous accompagnons sur vos premiers dossiers.',
  metriques: [
    { valeur: '3', libelle: 'espaces séparés' },
    { valeur: '7', libelle: 'jours de validité par lien' },
    { valeur: '3', libelle: 'mois de conservation' },
  ],
  merci: 'C’est noté.',
  suite:
    'Nous revenons vers vous sous 48 heures ouvrées, avec une démonstration sur un dossier réel : pas une plaquette.',
} as const

/** Les libelles du formulaire de demande de demonstration. */
export const demande = {
  nom: 'Nom de l’agence',
  nomExemple: 'Agence Bellevue',
  ville: 'Ville',
  villeExemple: 'Lyon',
  email: 'E-mail professionnel',
  emailExemple: 'contact@agence-bellevue.fr',
  volume: 'Dossiers de location par an',
  volumes: {
    'moins-de-10': 'Moins de 10',
    '10-50': 'Entre 10 et 50',
    '50-200': 'Entre 50 et 200',
    'plus-de-200': 'Plus de 200',
  } as Record<string, string>,
  message: 'Un mot sur votre fonctionnement',
  facultatif: '(facultatif)',
  messageExemple: 'Quel outil de signature utilisez-vous ? Où bloque la caution aujourd’hui ?',
  siteWeb: 'Site web',
  envoi: 'Envoi…',
  bouton: 'Demander une démonstration →',
  collecte:
    'Ces informations servent uniquement à vous recontacter au sujet de Cloison. Elles ne sont ni revendues, ni utilisées pour de la prospection tierce, et sont conservées le temps de traiter votre demande. Pour y accéder, les corriger ou les faire supprimer, il suffit de répondre à l’e-mail que vous recevrez.',
  merci: formulaire.merci,
  suite: formulaire.suite,
} as const
