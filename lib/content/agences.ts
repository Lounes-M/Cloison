/**
 * Le texte de la page /agences.
 *
 * L'angle diffère volontairement de la page d'accueil : celle-ci parle de la
 * gêne du locataire et de son garant, celle-là parle du temps que l'agence
 * perd. Même produit, acheteur différent.
 */

export const heroAgences = {
  eyebrow: 'Pour les agences',
  titre: ['La caution vous arrive', 'complète.', 'Ou pas du tout.'],
  sousTitre:
    "Plus de pièces reçues par cinq canaux différents, plus d'acte mal rempli à refaire. Vous ouvrez un lien : le dossier du garant est vérifié, le ratio est calculé, l'acte est pré-rempli.",
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
  badge: 'dossier complet',
  url: 'cloison.immo/d/8f2k',
  titre: 'Dossier · Garant M.',
  etat: 'vérifié',
  filigrane: 'Filigrané',
  pieces: ['Bulletins de paie ×3', "Avis d'imposition"],
  ratio: { libelle: 'Ratio', valeur: '3,4×' },
  acte: { libelle: 'Acte de cautionnement', valeur: 'Pré-rempli', action: 'Signer' },
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
      titre: 'Des pièces vérifiées',
      texte:
        "Le garant dépose lui-même, chez lui, sur son espace. Vous ne recevez rien tant que le dossier n'est pas complet.",
    },
    {
      ton: 'mint',
      titre: 'Un ratio déjà calculé',
      texte:
        'La solvabilité du garant est établie sur les pièces déposées, pas sur une estimation faite à la volée.',
    },
    {
      ton: 'sky',
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

/**
 * Les trois étapes du parcours agence.
 *
 * `etapes` est aussi lu par `home.ts` pour la piste agence de la section
 * « Comment ça marche » : deux descriptions du même parcours finiraient par
 * diverger, et c'est cette page qui fait foi. Sa forme (numéro, puce, titre,
 * texte) ne change donc pas sans regarder l'autre usage.
 */
export const commentCaMarche = {
  titre: ['Trois étapes,', 'aucune relance'],
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
      puce: 'prêt à signer',
      titre: 'Vous recevez un dossier complet',
      texte: "Pièces filigranées, ratio calculé, acte pré-rempli. Vous n'avez plus qu'à signer.",
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
    { libelle: 'Signer et archiver', valeur: 'À l’acte' },
    { libelle: 'Engagement de durée', valeur: 'Aucun' },
  ],
  total: { libelle: 'Le garant', valeur: '0 €' },
} as const

export const formulaire = {
  eyebrow: 'Pilote',
  titre: 'On démarre avec vingt agences.',
  sousTitre:
    "Trois villes tendues, six mois, un accompagnement direct. En échange, on veut vos retours sans filtre : c'est ce qui construit le produit.",
  metriques: [
    { valeur: '3', libelle: 'villes' },
    { valeur: '20', libelle: 'agences' },
    { valeur: '6', libelle: 'mois' },
  ],
} as const
