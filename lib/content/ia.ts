/**
 * Tout le texte de la page « Notre usage de l'IA ».
 *
 * Chaque phrase decrit un comportement que le code ou la base imposent. Une
 * promesse ajoutee ici sans son garde-fou technique est une promesse fausse :
 * voir `lib/ocr/`, `lib/garant/lecture-revenus.ts` et les migrations 0047,
 * 0087 et 0088.
 */

export const heroIa = {
  eyebrow: 'Notre usage de l’IA',
  /** Le titre en trois morceaux, celui du milieu en couleur. */
  titre: ['L’IA propose.', 'Vous décidez.', 'À chaque fois.'],
  sousTitre:
    'Chez Cloison, une IA ne lit une pièce que si quelqu’un le lui demande, pour une tâche précise, et elle n’enregistre rien à votre place. Voici exactement ce qu’elle fait, et ce qu’elle ne fera jamais.',
  ancre: 'Voir ce qu’elle fait',
  description:
    'Ce que l’IA fait chez Cloison, ce qu’elle ne fait jamais, et ce qui le garantit : lecture à la demande, aucune décision automatique, aucune conservation.',
} as const

export const usages = {
  titre: ['Deux usages,', 'pas un de plus.'],
  etat: { actif: 'Disponible', inactif: 'Pas encore activé' },
  items: [
    {
      cle: 'garant',
      pour: 'Pour le garant',
      titre: 'Trouver le bon revenu à déclarer',
      texte:
        'Brut, net imposable, net payé : le bulletin de paie affiche dix montants et un seul est le bon. Sur demande, une IA lit vos bulletins et votre attestation de pension déjà déposés, puis propose votre revenu net mensuel. Vous le vérifiez, vous le reportez, vous enregistrez.',
      points: [
        'Elle ne lit que le mois et le montant net payé',
        'La moyenne est calculée par Cloison, pas par l’IA',
        'Rien n’est enregistré sans votre clic',
      ],
    },
    {
      cle: 'agence',
      pour: 'Pour l’agence',
      titre: 'Relire une pièce plus vite',
      texte:
        'Un scan pâle, une photo de travers, quarante pages : sur demande, une IA transcrit le texte d’un justificatif que l’agence a déjà le droit d’ouvrir. La transcription s’affiche à côté du document, le temps de la relecture, puis disparaît.',
      points: [
        'Une copie filigranée, jamais l’original',
        'Un texte à comparer au document, pas une vérification',
        'Rien n’est ajouté au dossier',
      ],
    },
  ],
} as const

export const deroule = {
  titre: ['Quatre gestes,', 'tous les vôtres.'],
  etapes: [
    {
      numero: 1,
      titre: 'Vous demandez',
      puce: 'Jamais d’office',
      texte:
        'Aucune pièce n’est lue au dépôt, en arrière-plan ou par lot. La lecture part d’un bouton, après une case à cocher qui dit où va le fichier.',
    },
    {
      numero: 2,
      titre: 'Elle lit le strict nécessaire',
      puce: 'Une tâche, une réponse',
      texte:
        'La réponse attendue est fermée à l’avance. Pour un revenu : un mois et un montant. Si l’IA renvoie autre chose, un nom ou un numéro, la réponse entière est rejetée.',
    },
    {
      numero: 3,
      titre: 'Vous vérifiez',
      puce: 'Elle peut se tromper',
      texte:
        'La proposition s’affiche avec les mois lus et le détail du calcul. Deux montants différents pour un même mois ? Il est écarté et signalé, pas tranché.',
    },
    {
      numero: 4,
      titre: 'Vous enregistrez',
      puce: 'Ou pas',
      texte:
        'Tant que vous n’avez pas cliqué sur Enregistrer, le dossier n’a pas bougé. Le chiffre déclaré reste le vôtre, et l’agence le compare toujours aux pièces.',
    },
  ],
} as const

export const jamais = {
  mot: 'jamais',
  titre: 'Ce que l’IA ne fera',
  cartes: [
    {
      label: 'Lire une pièce d’identité',
      texte: 'La base refuse la demande avant même d’ouvrir le fichier.',
    },
    {
      label: 'Décider d’un dossier',
      texte: 'Ni acceptation, ni refus, ni statut. Ce sont des décisions humaines.',
    },
    {
      label: 'Noter une personne',
      texte: 'Aucun score, aucun profil, aucune estimation de solvabilité.',
    },
    {
      label: 'Écrire à votre place',
      texte: 'Ni votre revenu, ni votre mention de cautionnement, ni votre signature.',
    },
  ],
  conclusion: ['Le garant aide un proche.', 'Il ne nourrit pas', 'un algorithme.'],
  texte:
    'Le ratio est une division entre un loyer et un revenu déclaré. Les pièces en sont la preuve, et c’est une personne, à l’agence, qui les regarde.',
} as const

export const garanties = {
  titre: ['Ce qui le garantit,', 'concrètement.'],
  sousTitre:
    'Ces règles ne sont pas des intentions : elles sont écrites dans le code et dans la base, et vérifiées par des tests à chaque modification.',
  items: [
    {
      cle: 'conservation',
      titre: 'Zéro conservation',
      libelle:
        'Chaque demande exige un fournisseur qui ne garde ni le fichier ni la réponse, et qui ne s’en sert pas pour entraîner un modèle. Sans cela, la demande n’est pas envoyée.',
    },
    {
      cle: 'europe',
      titre: 'Lecture en Europe',
      libelle:
        'La lecture des revenus est confiée à un serveur situé en Europe, imposé à chaque demande, sans repli vers un autre.',
    },
    {
      cle: 'journal',
      titre: 'Inscrite à l’historique',
      libelle:
        'Chaque demande de lecture ajoute une ligne à l’historique du dossier, avant toute ouverture du fichier. Le garant la voit dans son espace.',
    },
    {
      cle: 'ephemere',
      titre: 'Rien n’est gardé',
      libelle:
        'Ni la transcription ni la proposition ne sont enregistrées, chez Cloison comme dans votre navigateur. Fermez la page : elles n’existent plus.',
    },
    {
      cle: 'quota',
      titre: 'Un usage borné',
      libelle:
        'Quelques lectures par dossier toutes les dix minutes, pas davantage. Une IA ne peut pas parcourir les dossiers en série.',
    },
    {
      cle: 'facultatif',
      titre: 'Toujours facultative',
      libelle:
        'Le dossier se remplit entièrement sans IA. Ne pas s’en servir ne change ni les délais, ni l’examen de l’agence.',
    },
  ],
} as const

export const suiteIa = {
  titre: ['Une question', 'sur vos données ?'],
  texte:
    'La politique de confidentialité nomme le prestataire qui reçoit les fichiers, et les questions fréquentes disent qui voit quoi.',
  liens: [
    { label: 'Lire la confidentialité', href: '/confidentialite' },
    { label: 'Questions fréquentes', href: '/questions' },
  ],
  cta: 'Créer mon dossier',
} as const
