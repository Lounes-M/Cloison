import { euros } from './tarifs'

/** La colocation, vue par l’agence, le colocataire et son garant. */
export const colocation = {
  titre: 'Colocation',
  retour: 'Tous les dossiers',
  etendues: {
    part: 'Chaque garant s’engage sur la part de son colocataire',
    loyer_entier: 'Chaque garant s’engage sur le loyer entier (bail solidaire)',
  },
  solvabilites: {
    individuelle: 'Chaque colocataire est jugé avec ses propres garants',
    commune: 'Tous les garants sont jugés ensemble, sur le loyer total',
  },
  commune: {
    ratio: (ratio: string) => `Solvabilité commune : ${ratio}× le loyer total.`,
    attente: 'Solvabilité commune : en attente des revenus de tous les garants.',
    aide: 'Le résultat est le même pour tous les dossiers, et n’arrive que lorsque chaque garant a tout déposé.',
  },
  reglages: {
    solvabilite: 'Solvabilité',
    communIndisponible:
      'Juger les garants ensemble demande que chacun s’engage sur le loyer entier.',
    garantTitre: 'Garant commun',
    garantAide:
      'Plusieurs colocataires ont le même garant ? Gardez un seul dossier pour eux et indiquez combien il en couvre : le garant dépose et signe une seule fois, et son acte les nomme tous. Refusez ou clôturez ensuite les dossiers devenus inutiles.',
    dossier: 'Dossier',
    garantis: 'Colocataires couverts par son garant',
    bouton: 'Enregistrer',
    envoi: 'Enregistrement…',
    fait: 'Enregistré.',
    impossible: 'Le réglage n’a pas pu être enregistré. Réessayez dans un instant.',
    fige: 'Un dossier est déjà pris : la solvabilité ne se règle plus.',
    garantFige:
      'Ce dossier est pris, ou son garant a déjà saisi sa mention : le garant commun ne se modifie plus.',
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
    garantis: (n: number) => `Garant commun à ${n} colocataires`,
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
    solvabilite: 'Solvabilité',
    solvabiliteAide:
      'Juger les garants ensemble n’est possible que si chacun s’engage sur le loyer entier.',
    garantCommun: 'Garant commun à plusieurs colocataires',
    garantCommunAide:
      'Si plusieurs colocataires ont le même garant, ils partagent un seul dossier et un seul acte : saisissez une seule adresse pour eux, en premier, et indiquez combien ils sont.',
    garantCommunChoix: (n: number) =>
      n === 1
        ? 'Non : chaque colocataire a son garant'
        : `Le garant de la première adresse couvre ${n} colocataires`,
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
    adresses:
      'Saisissez de deux à huit adresses e-mail valides, une par ligne. Une seule suffit si son garant couvre plusieurs colocataires.',
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
    garantCommun: (n: number) =>
      `Son garant couvre ${n} colocataires de ce bail : un seul acte les nommera.`,
    commune: 'La solvabilité est jugée sur l’ensemble de la colocation.',
  },
  acteCommun: (n: number) =>
    `Le garant de ce dossier couvre ${n} colocataires. Nommez les autres dans « Autres colocataires garantis » : le colocataire saisi dans « Prénom et nom du locataire » est celui dont le départ met fin à l’engagement.`,
  acte: 'Ce dossier fait partie d’une colocation. L’acte nommera le colocataire garanti et reproduira l’article 8-1 de la loi de 1989. Saisissez le loyer du bail entier, et nommez les garants des autres colocataires dans « Autres cautions ».',
  locataire: {
    titre: 'Colocation',
    texte: (n: number, total: string) =>
      `Tu fais partie d’une colocation de ${n} personnes, pour un loyer total de ${total}. Chaque colocataire a son propre dossier et son propre garant : tu ne vois pas ceux des autres, et ils ne voient pas le tien.`,
    montant: (montant: string) => `Montant retenu pour ton dossier : ${montant}.`,
    loyerPart: 'Ta part de loyer est fixée par l’agence. Si elle est fausse, écris-lui.',
    loyerEntier:
      'Le bail est solidaire : ton garant s’engage sur le loyer entier. Ce montant est fixé par l’agence.',
    garantCommun: (n: number) =>
      `Ton garant est commun à ${n} colocataires : ce dossier vous couvre tous, et il ne dépose et ne signe qu’une seule fois.`,
    commune:
      'L’agence juge tous les garants de la colocation ensemble : le résultat arrive quand chacun a terminé.',
  },
  garant: {
    part: (n: number, total: string) =>
      `Ce bail est une colocation de ${n} personnes, pour un loyer total de ${total}. Vous vous portez caution d’un seul colocataire, sur sa part de loyer.`,
    loyerEntier: (n: number, total: string) =>
      `Ce bail est une colocation solidaire de ${n} personnes, pour un loyer total de ${total}. Vous vous portez caution d’un seul colocataire, mais sur le loyer entier.`,
    communPart: (k: number, n: number, total: string) =>
      `Ce bail est une colocation de ${n} personnes, pour un loyer total de ${total}. Vous vous portez caution de ${k} colocataires, sur leurs parts de loyer, par un seul acte.`,
    communEntier: (k: number, n: number, total: string) =>
      `Ce bail est une colocation solidaire de ${n} personnes, pour un loyer total de ${total}. Vous vous portez caution de ${k} colocataires, sur le loyer entier, par un seul acte.`,
    commune:
      'L’agence juge tous les garants de la colocation ensemble : le résultat arrive quand chacun a terminé.',
  },
} as const
