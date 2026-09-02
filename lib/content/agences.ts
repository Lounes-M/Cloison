/**
 * Le texte de la page /agences.
 *
 * L'angle diffère volontairement de la page d'accueil : celle-ci parle de la
 * gêne du locataire et de son garant, celle-là parle du temps que l'agence
 * perd. Même produit, acheteur différent.
 */

export const heroAgences = {
  eyebrow: 'Pour les agences',
  titre: ['La caution vous arrive', 'complète. Ou pas du tout.'],
  sousTitre:
    "Plus de pièces reçues par cinq canaux différents, plus d'acte mal rempli à refaire. Vous ouvrez un lien : le dossier du garant est vérifié, le ratio est calculé, l'acte est pré-rempli.",
  ancreFormulaire: 'Demander une démonstration',
} as const

export const douleurs = {
  eyebrow: 'Ce que ça vous coûte aujourd’hui',
  items: [
    {
      titre: 'Des pièces qui arrivent de partout',
      texte:
        "Par mail, par WhatsApp, en photo de travers, parfois par le locataire qui transfère celles de son oncle. Quelqu'un chez vous les rassemble à la main.",
    },
    {
      titre: 'Un acte de cautionnement à reprendre',
      texte:
        'Imprimé, mal rempli, rescanné. Chaque aller-retour coûte des jours sur un bien qui reste vide.',
    },
    {
      titre: 'Un doute que personne ne lève',
      texte:
        "Le garant est-il réellement solvable ? Le calcul se fait de tête, dans l'urgence, sur des documents qu'on n'a pas le temps de vérifier.",
    },
  ],
} as const

export const cequonapporte = {
  titre: ['Un lien.', 'Tout est dedans.'],
  items: [
    {
      tone: 'sun',
      titre: 'Des pièces vérifiées',
      texte:
        "Le garant dépose lui-même, chez lui, sur son espace. Vous ne recevez rien tant que le dossier n'est pas complet.",
    },
    {
      tone: 'mint',
      titre: 'Un ratio déjà calculé',
      texte:
        'La solvabilité du garant est établie sur les pièces déposées, pas sur une estimation faite à la volée.',
    },
    {
      tone: 'sky',
      titre: 'Un acte prêt à signer',
      texte:
        "Pré-rempli à partir du bail et des pièces, signé électroniquement, archivé. Plus d'impression, plus de rescan.",
    },
  ],
  garantie: {
    titre: 'Et les pièces restent filigranées',
    texte:
      "Vous voyez ce qu'il faut pour décider, dans un format qui vous engage à ne pas le diffuser. Chaque consultation laisse une trace.",
  },
} as const

export const commentCaMarche = {
  titre: 'Trois étapes, aucune relance',
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
      puce: 'acte pré-rempli',
      titre: 'Vous recevez un dossier complet',
      texte: "Pièces filigranées, ratio calculé, acte pré-rempli. Vous n'avez plus qu'à signer.",
    },
  ],
} as const

export const tarifAgence = {
  titre: 'Ce que ça vous coûte',
  points: [
    { libelle: 'Consulter un dossier', valeur: 'Gratuit' },
    { libelle: 'Signer et archiver', valeur: 'À l’acte' },
    { libelle: 'Engagement de durée', valeur: 'Aucun' },
  ],
  note: "Le garant ne paie jamais rien, dans aucun cas. C'est la règle qui fait que le dossier avance jusqu'au bout.",
} as const

export const formulaire = {
  eyebrow: 'Pilote',
  titre: ['On démarre avec', 'vingt agences.'],
  sousTitre:
    "Trois villes tendues, six mois, un accompagnement direct. En échange, on veut vos retours sans filtre : c'est ce qui construit le produit.",
} as const
