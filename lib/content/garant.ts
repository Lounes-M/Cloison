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
 * Miroir exact de la contrainte `type` de la table `pieces` (migration 0003).
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
] as const

export type NatureValeur = (typeof natures)[number]['valeur']

export const depot = {
  original: 'Télécharger mon original',
  titre: 'Ton dépôt',
  demandePar: (email: string) => `${email} t’a désigné comme garant.`,
  reference: 'Référence',
  discretion:
    'Tes pièces sont chiffrées par notre serveur avant leur stockage, et le locataire n’y a pas accès. Il voit seulement que le dossier avance.',
  piecesTitre: 'Tes pièces',
  formats: 'PDF, JPEG ou PNG, 4 Mo par fichier. Une photo bien cadrée suffit.',
  ajouter: 'Ajouter',
  envoi: 'Envoi…',
  retirer: 'Retirer',
  retraitEnCours: 'Retrait…',
  deposeLe: (date: string) => `déposé le ${date}`,
  fermeTitre: 'Le dépôt est clos',
  fermeTexte: 'Le dossier est parti à l’agence. Tes pièces ne bougent plus : elle décide dessus.',
} as const

export const engagement = {
  titre: 'Ce que tu couvres',
  aide: 'Ce que tu déclares ici figurera dans l’acte de cautionnement. Tu peux le corriger tant que le dossier n’est pas parti.',
  revenu: 'Ton revenu net mensuel',
  revenuAide:
    'En euros, ce que tu touches au total après impôt à la source. Tes bulletins en sont la preuve : l’agence les compare. Vide, le dossier reste en attente.',
  couvre: 'Tu couvres',
  couvreOptions: [
    { valeur: 'loyer_charges', libelle: 'Le loyer et les charges' },
    { valeur: 'loyer', libelle: 'Le loyer seul' },
  ] as const,
  montant: 'Montant maximum, au total',
  montantAide: 'En euros. Laisse vide si tu ne veux pas de plafond.',
  jusquAu: 'Jusqu’au',
  jusquAuAide: 'Laisse vide pour la durée du bail.',
  solidaire: 'Caution solidaire',
  solidaireAide:
    'L’agence peut te demander de payer dès le premier impayé, sans poursuivre le locataire d’abord. C’est ce que demandent presque toutes les agences.',
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
  titre: 'Ta mention',
  intro:
    'Tu peux préparer ta mention avant la transmission du dossier. Cette étape n’est pas une signature et le contrôle automatique ne certifie pas la validité juridique du texte.',
  prenom: 'Ton prénom',
  nom: 'Ton nom',
  adresse: 'Ton adresse',
  elementsTitre: 'Ce que ta mention doit contenir',
  elements: {
    caution: 'Que tu t’engages en qualité de caution.',
    paiement: 'Que tu paieras le bailleur si le locataire ne paie pas.',
    montant:
      'Le montant maximum que tu garantis, écrit deux fois : en chiffres et en toutes lettres. Les deux doivent dire la même chose.',
    solidarite:
      'Comme tu as choisi une caution solidaire : que tu renonces au bénéfice de discussion et au bénéfice de division.',
  },
  elementsAide:
    'La formulation est libre. Ce qui compte, c’est que ces éléments y soient, dans tes mots.',
  champ: 'Ta mention, écrite par toi',
  bouton: 'Apposer ma mention',
  corriger: 'Corriger ma mention',
  envoi: 'Vérification…',
  succes: 'Mention apposée. L’acte peut être préparé.',
  manques: {
    caution: 'On ne lit pas que tu t’engages en qualité de caution.',
    paiement: 'On ne lit pas que tu paieras en cas de défaillance du locataire.',
    montant: 'On ne trouve pas un montant écrit en chiffres et en lettres qui concordent.',
    solidarite:
      'On ne lit pas la renonciation aux bénéfices de discussion et de division, exigée pour une caution solidaire.',
  },
} as const
