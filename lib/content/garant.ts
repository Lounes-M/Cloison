/**
 * Ce que le garant lit.
 *
 * Deux promesses gouvernent chaque phrase. La premiere, a lui : le locataire ne
 * verra jamais ce qu'il depose, seulement que le dossier avance. La seconde,
 * a lui aussi : il sait exactement ce qu'on attend, piece par piece, pour ne
 * pas avoir a deviner ni a redeposer.
 */

/**
 * Les natures de pieces, dans l'ordre ou on les demande.
 *
 * Miroir de la contrainte `type` de la table `pieces`, etendue en migration 0043.
 * Un test le verifie : une nature ajoutee ici et absente la-bas ne se verrait
 * qu'a l'execution, sous la forme d'un depot refuse sans explication.
 */
export const natures = [
  {
    valeur: 'bulletin_paie',
    libelle: 'Bulletins de paie',
    aide: 'Les trois derniers. Un fichier par bulletin, ou un seul PDF qui les contient.',
    attendu: 3,
  },
  {
    valeur: 'avis_imposition',
    libelle: 'Avis d’imposition',
    aide: 'Le dernier, toutes les pages.',
    attendu: 1,
  },
  {
    valeur: 'piece_identite',
    libelle: 'Pièce d’identité',
    aide: 'Carte d’identité recto et verso, ou passeport.',
    attendu: 1,
  },
  {
    valeur: 'justificatif_domicile',
    libelle: 'Justificatif de domicile',
    aide: 'Facture d’énergie, d’eau ou de téléphone de moins de trois mois.',
    attendu: 1,
  },
  {
    valeur: 'contrat_travail',
    libelle: 'Contrat de travail',
    aide: 'Ou attestation employeur. Facultatif si les bulletins suffisent.',
    attendu: 0,
  },
  {
    valeur: 'pension_retraite',
    libelle: 'Droits à la retraite',
    aide: 'Justificatif d’ouverture des droits établi par l’organisme payeur.',
    attendu: 1,
  },
  {
    valeur: 'bilan_comptable',
    libelle: 'Bilans comptables',
    aide: 'Les deux derniers bilans, séparés ou dans un PDF groupé. Une attestation de ressources peut les remplacer.',
    attendu: 2,
  },
  {
    valeur: 'attestation_ressources',
    libelle: 'Attestation de ressources',
    aide: 'Pour l’année en cours, établie par un comptable. Remplace les deux bilans.',
    attendu: 0,
  },
  {
    valeur: 'activite_independante',
    libelle: 'Activité professionnelle',
    aide: 'Justificatif récent adapté à votre activité : identification INSEE, immatriculation ou carte professionnelle.',
    attendu: 1,
  },
] as const

export type NatureValeur = (typeof natures)[number]['valeur']
export const profilsRessources = [
  { valeur: 'salarie', libelle: 'Salarié' },
  { valeur: 'retraite', libelle: 'Retraité' },
  { valeur: 'independant', libelle: 'Indépendant' },
] as const
export type ProfilRessources = (typeof profilsRessources)[number]['valeur']
export function naturesDuProfil(profil: ProfilRessources) {
  const communes: NatureValeur[] = ['avis_imposition', 'piece_identite', 'justificatif_domicile']
  const propres: Record<ProfilRessources, NatureValeur[]> = {
    salarie: ['bulletin_paie', 'contrat_travail'],
    retraite: ['pension_retraite'],
    independant: ['bilan_comptable', 'attestation_ressources', 'activite_independante'],
  }
  return natures.filter((nature) => [...communes, ...propres[profil]].includes(nature.valeur))
}
export const documentsDeclares = {
  profil: (libelle: string) => `Liste adaptée à votre situation : ${libelle.toLowerCase()}.`,
  changerProfil: 'Changer ma situation',
  nombre: 'Nombre de documents dans ce fichier',
  aide: 'Indiquez les justificatifs distincts, pas le nombre de pages. Le contenu sera examiné par l’agence.',
  bilan: (nombre: number) =>
    `${nombre} document${nombre > 1 ? 's' : ''} déclaré${nombre > 1 ? 's' : ''}`,
  presence:
    'Cette liste suit les pièces déclarées. Leur présence ne certifie ni leur contenu ni leur authenticité.',
  corriger: 'Corriger le nombre déclaré',
  invalide: 'Indiquez un nombre de documents adapté à cette pièce.',
  erreur: 'La déclaration du contenu n’a pas pu être enregistrée.',
}

export const depot = {
  vide: 'Choisissez un fichier non vide.',
  tropLourd:
    'Ce fichier dépasse 4 Mo. Réduisez sa taille ou choisissez une photo mieux cadrée avant de réessayer.',
  preparation: 'Préparation de la photo…',
  selection: 'Fichier sélectionné :',
  annulerSelection: 'Annuler la sélection',
  debit: 'Trop de documents ont été proposés récemment. Réessayez dans un quart d’heure.',
  original: 'Télécharger mon original',
  titre: 'Votre dépôt',
  demandePar: (email: string) => `${email} vous a désigné comme garant.`,
  reference: 'Référence',
  discretion:
    'Vos pièces sont chiffrées par notre serveur avant leur stockage, et le locataire n’y a pas accès. Il voit seulement que le dossier avance.',
  piecesTitre: 'Vos pièces',
  formats: 'PDF, JPEG ou PNG, 4 Mo par fichier. Une photo bien cadrée suffit.',
  ajouter: 'Ajouter',
  deposer: 'Déposer le fichier sélectionné',
  envoi: 'Envoi…',
  retirer: 'Retirer',
  retraitEnCours: 'Retrait…',
  deposeLe: (date: string) => `déposé le ${date}`,
  fermeTitre: 'Le dépôt est clos',
  fermeTexte: 'Le dossier est parti à l’agence. Vos pièces ne bougent plus : elle décide dessus.',
} as const

export const engagement = {
  titre: 'Ce que vous couvrez',
  aide: 'Ce que vous déclarez ici figurera dans l’acte de cautionnement. Vous pouvez le corriger tant que le dossier n’est pas parti.',
  revenu: 'Votre revenu net mensuel',
  profil: 'Votre situation professionnelle',
  profilInvalide: 'Choisissez une situation professionnelle proposée.',
  profilAide:
    'Enregistrez votre situation pour adapter la liste des justificatifs. Les revenus restent déclarés et seront comparés aux pièces par l’agence.',
  revenuAide:
    'En euros, ce que vous touchez au total après impôt à la source. L’agence compare cette déclaration à vos justificatifs de revenus. Vide, le dossier reste en attente.',
  couvre: 'Vous couvrez',
  couvreOptions: [
    { valeur: 'loyer_charges', libelle: 'Le loyer et les charges' },
    { valeur: 'loyer', libelle: 'Le loyer seul' },
  ] as const,
  montant: 'Montant maximum, au total',
  montantAide:
    'En euros, pour la totalité de votre engagement. Un montant maximum est nécessaire pour préparer votre mention. Les centimes sont acceptés.',
  jusquAu: 'Jusqu’au',
  jusquAuAide: 'Laissez vide pour la durée du bail.',
  solidaire: 'Caution solidaire',
  solidaireAide:
    'L’agence peut vous demander de payer dès le premier impayé, sans poursuivre le locataire d’abord. C’est ce que demandent presque toutes les agences.',
  bouton: 'Enregistrer',
  envoi: 'Enregistrement…',
  succes: 'Enregistré.',
} as const

/**
 * La mention : guidee, jamais fournie.
 *
 * Aucune phrase modele ici, ni dans le formulaire, ni dans une aide, ni dans
 * un `placeholder`. La loi exige que la caution l'appose elle-meme, et
 * l'ADR 0005 tient qu'un texte pre-suggere d'un peu trop pres suffirait a
 * faire tomber l'engagement. On decrit ce qu'elle doit contenir ; on ne
 * l'ecrit pas.
 */
export const mention = {
  titre: 'Votre mention',
  intro:
    'Vous pouvez préparer votre mention avant la transmission du dossier. Cette étape n’est pas une signature et le contrôle automatique ne certifie pas la validité juridique du texte.',
  prenom: 'Votre prénom',
  nom: 'Votre nom',
  adresse: 'Votre adresse',
  elementsTitre: 'Ce que votre mention doit contenir',
  elements: {
    caution: 'Que vous vous engagez en qualité de caution.',
    paiement: 'Que vous paierez le bailleur si le locataire ne paie pas.',
    montant:
      'Le montant maximum que vous garantissez, écrit deux fois : en chiffres et en toutes lettres. Les deux doivent dire la même chose.',
    solidarite:
      'Comme vous avez choisi une caution solidaire : que vous renoncez au bénéfice de discussion et au bénéfice de division.',
  },
  elementsAide:
    'La formulation est libre. Ce qui compte, c’est que ces éléments y soient, dans vos mots.',
  champ: 'Votre mention, écrite par vous',
  bouton: 'Apposer ma mention',
  corriger: 'Corriger ma mention',
  envoi: 'Vérification…',
  succes:
    'Mention enregistrée. Les éléments repérés automatiquement restent à examiner avant la signature.',
  manques: {
    caution: 'On ne lit pas que vous vous engagez en qualité de caution.',
    paiement: 'On ne lit pas que vous paierez en cas de défaillance du locataire.',
    montant: 'On ne trouve pas un montant écrit en chiffres et en lettres qui concordent.',
    solidarite:
      'On ne lit pas la renonciation aux bénéfices de discussion et de division, exigée pour une caution solidaire.',
  },
} as const

/** L'encart du haut : ce qu'il reste, sans verdict et sans chiffre de solvabilite. */
export const resteAFaire = {
  titre: 'Ce qu’il vous reste à faire',
  aide: 'Chaque ligne mène à l’endroit de la page où la compléter.',
  termine:
    'Tout ce qu’on attend de vous est là. L’agence examinera vos pièces ; vous pouvez encore les corriger tant que le dossier n’est pas parti.',
  engagement: 'Indiquez ce que vous couvrez, votre revenu net mensuel et un montant maximum.',
  complement: (nombre: number) =>
    nombre > 1
      ? `Remplacez les ${nombre} pièces que l’agence vous a demandé de redéposer.`
      : 'Remplacez la pièce que l’agence vous a demandé de redéposer.',
  piece: (libelle: string, manque: number, attendu: number) =>
    attendu > 1
      ? `${libelle} : ${manque} document${manque > 1 ? 's' : ''} manquant${manque > 1 ? 's' : ''} sur ${attendu}.`
      : `${libelle} : à déposer.`,
  mention: 'Apposez votre mention, écrite par vous.',
} as const
