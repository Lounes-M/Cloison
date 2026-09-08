/**
 * Le texte de la page /agences.
 *
 * L'angle diffère volontairement de la page d'accueil : celle-ci parle de la
 * gêne du locataire et de son garant, celle-là parle du temps que l'agence
 * perd. Même produit, acheteur différent.
 */

import { prixActe } from './tarifs'
import { pilote } from './pilote'

export const heroAgences = {
  eyebrow: 'Pilote pour les agences',
  titre: ['La caution vous arrive', 'complète.', 'Ou pas du tout.'],
  sousTitre:
    'Les pièces du garant sont réunies dans un espace séparé. Vous les consultez filigranées, avec un ratio calculé à partir du revenu déclaré. Vous restez responsable de leur examen.',
  ancreFormulaire: 'Demander une démonstration',
} as const

/**
 * L'aperçu de dossier montré à côté du titre.
 *
 * Il montre ce que la page promet plutôt que de le décrire, et c'est le seul
 * endroit du site où l'on voit à quoi ressemble un dossier reçu. Les valeurs
 * sont fictives et le disent : « Garant M. », un ratio arrondi, un identifiant
 * tronqué.
 */
export const apercuDossier = {
  badge: 'exemple fictif',
  url: 'cloison.immo/d/8f2k',
  titre: 'Dossier · Garant M.',
  etat: 'à examiner',
  filigrane: 'Filigrané',
  pieces: ['Bulletins de paie ×3', "Avis d'imposition"],
  ratio: { libelle: 'Ratio', valeur: '3,4×' },
  acte: { libelle: 'Signature', valeur: 'À venir', action: 'Pilote' },
} as const

export const douleurs = {
  eyebrow: 'Ce que ça vous coûte aujourd’hui',
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
      titre: 'La signature, prochaine étape',
      texte: pilote.signature,
    },
  ],
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
  titre: ['Ce que ça', 'vous', 'coûte'],
  regleOr:
    "Le garant ne paie jamais rien, dans aucun cas. C'est la règle qui fait que le dossier avance jusqu'au bout.",
  tampon: 'Sans surprise',
  entete: 'tarif agences',
  lignes: [
    { libelle: 'Consulter un dossier', valeur: 'Gratuit', ton: 'vert' },
    { libelle: 'Signature à venir, par acte signé et archivé', valeur: prixActe },
    { libelle: 'Engagement de durée', valeur: 'Aucun' },
  ],
  total: { libelle: 'Le garant', valeur: '0 €' },
} as const

export const formulaire = {
  eyebrow: 'Pilote',
  titre: 'Notre objectif : vingt agences pilotes.',
  sousTitre:
    "Trois villes tendues, six mois, un accompagnement direct. En échange, on veut vos retours sans filtre : c'est ce qui construit le produit.",
  metriques: [
    { valeur: '3', libelle: 'villes' },
    { valeur: '20', libelle: 'agences' },
    { valeur: '6', libelle: 'mois' },
  ],
} as const
