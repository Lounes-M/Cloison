import { euros } from './tarifs'

/** La colocation, vue par l'agence, le colocataire et son garant. */
export const colocation = {
  titre: 'Colocation',
  retour: 'Tous les dossiers',
  etendues: {
    part: 'Chaque garant s’engage sur la part de son colocataire',
    loyer_entier: 'Chaque garant s’engage sur le loyer entier (bail solidaire)',
  },
  entete: (total: number, n: number) =>
    `${euros(total)} de loyer total, ${n} colocataire${n > 1 ? 's' : ''}`,
  logement: 'Logement',
  etat: {
    complete: 'Tous les dossiers sont complets : la colocation peut être étudiée.',
    enCours: (complets: number, n: number) =>
      `${complets} dossier${complets > 1 ? 's' : ''} complet${complets > 1 ? 's' : ''} sur ${n}.`,
    vide: 'Aucun dossier ouvert dans cette colocation.',
  },
  decision:
    'Prendre, refuser ou clore se fait dossier par dossier : un colocataire refusé peut être remplacé sans toucher aux autres.',
  tableau: {
    titre: 'Les colocataires',
    locataire: 'Colocataire',
    reference: 'Dossier',
    statut: 'État',
    loyer: 'Loyer garanti',
    ratio: 'Solvabilité',
    attente: 'En attente',
    sansLoyer: 'À saisir',
    partis: 'Dossiers refusés ou clos',
  },
  parts: {
    ecart: (somme: number, total: number) =>
      `Les parts font ${euros(somme)} pour un loyer total de ${euros(total)}. Corrigez le loyer sur la fiche de chaque dossier.`,
    incompletes: 'La part de certains colocataires reste à saisir sur la fiche de leur dossier.',
  },
  formulaire: {
    titre: 'Ouvrir une colocation',
    aide: 'Plusieurs locataires sur un même bail, chacun avec son garant. Chacun reçoit son lien et son propre dossier : aucun ne voit les pièces ni l’avancement des autres.',
    courriels: 'Adresses e-mail des colocataires',
    courrielsAide: 'Une adresse par ligne, de deux à huit colocataires.',
    courrielsAjout: 'Adresse e-mail du nouveau colocataire',
    courrielsAjoutAide: 'Une adresse par ligne si plusieurs colocataires arrivent ensemble.',
    loyer: 'Loyer total du bail, charges comprises',
    loyerAide:
      'En engagement sur la part, le loyer est réparti à parts égales. Vous pourrez corriger la part de chacun sur la fiche de son dossier.',
    etendue: 'Engagement de chaque garant',
    bouton: 'Envoyer les liens',
    boutonAjout: 'Ajouter à la colocation',
    envoi: 'Envoi…',
    ajoutTitre: 'Ajouter un colocataire',
    ajoutAide:
      'Pour un colocataire de plus ou le remplaçant d’un colocataire refusé. Sa part est proposée à parts égales et se corrige sur la fiche de son dossier.',
    succes: (n: number) =>
      `${n} dossier${n > 1 ? 's' : ''} ouvert${n > 1 ? 's' : ''}. L’envoi des liens est programmé.`,
    voir: 'Voir la colocation',
    echecs: (adresses: string) =>
      `Ces adresses n’ont pas pu être ajoutées : ${adresses}. Réessayez depuis la fiche de la colocation.`,
  },
  erreurs: {
    adresses: 'Saisissez de deux à huit adresses e-mail valides, une par ligne.',
    adresse: 'Saisissez au moins une adresse e-mail valide.',
    doublon: 'Chaque colocataire a sa propre adresse : une adresse apparaît deux fois.',
    dejaPresente: 'Une de ces adresses figure déjà dans la colocation.',
    trop: 'Une colocation compte au plus huit colocataires.',
    loyer: 'Le loyer total ne se lit pas. Exemple : 1200 ou 1200,50.',
    impossible: 'La colocation n’a pas pu être ouverte. Réessayez dans un instant.',
    nonVerifiee:
      'Votre agence n’est pas encore vérifiée : l’ouverture d’une colocation attend la vérification.',
    session: 'Session expirée.',
  },
  fiche: {
    lien: (n: number) => `Ce dossier fait partie d’une colocation de ${n} personnes.`,
    ouvrir: 'Voir la colocation',
  },
  acte: 'Ce dossier fait partie d’une colocation. L’acte nommera le colocataire garanti et reproduira l’article 8-1 de la loi de 1989. Saisissez le loyer du bail entier, et nommez les garants des autres colocataires dans « Autres cautions ».',
  locataire: {
    titre: 'Colocation',
    texte: (n: number, total: string) =>
      `Tu fais partie d’une colocation de ${n} personnes, pour un loyer total de ${total}. Chaque colocataire a son propre dossier et son propre garant : tu ne vois pas ceux des autres, et ils ne voient pas le tien.`,
    montant: (montant: string) => `Montant retenu pour ton dossier : ${montant}.`,
    loyerPart: 'Ta part de loyer est fixée par l’agence. Si elle est fausse, écris-lui.',
    loyerEntier:
      'Le bail est solidaire : ton garant s’engage sur le loyer entier. Ce montant est fixé par l’agence.',
  },
  garant: {
    part: (n: number, total: string) =>
      `Ce bail est une colocation de ${n} personnes, pour un loyer total de ${total}. Vous vous portez caution d’un seul colocataire, sur sa part de loyer.`,
    loyerEntier: (n: number, total: string) =>
      `Ce bail est une colocation solidaire de ${n} personnes, pour un loyer total de ${total}. Vous vous portez caution d’un seul colocataire, mais sur le loyer entier.`,
  },
} as const
