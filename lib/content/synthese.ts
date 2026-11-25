/**
 * La synthese du dossier remise au bailleur.
 *
 * Une page que l’agence telecharge pour le proprietaire. Elle dit ce qui a
 * ete verifie et ou en est l’acte ; elle ne contient ni justificatif ni
 * montant de revenu. Le bailleur est vouvoye, comme l’agence.
 */
export const synthese = {
  ecran: {
    titre: 'Synthèse pour le bailleur',
    aide: 'Une page à remettre au propriétaire : le ratio face à votre seuil, les pièces examinées et l’état de l’acte. Elle ne contient aucun justificatif ni aucun montant de revenu. Chaque exemplaire porte votre nom et son téléchargement est inscrit au journal du dossier.',
    telecharger: 'Télécharger la synthèse (PDF)',
  },
  refus:
    'La synthèse n’a pas pu être préparée. Le dossier n’est plus accessible, ou la limite de dix synthèses par heure est atteinte.',
  indisponible: 'La synthèse n’a pas pu être produite. Réessayez dans un instant.',
  fichier: 'synthese-bailleur',
  pdf: {
    titre: 'Synthèse du dossier de caution',
    sousTitre: (agence: string, date: string) =>
      `Établie par ${agence} le ${date}, à l’attention du bailleur.`,
    demonstration: 'Dossier de démonstration : garant fictif, sans valeur pour un bail réel.',
    dossier: 'Le dossier',
    reference: 'Référence',
    locataire: 'Locataire',
    logement: 'Logement',
    loyer: 'Loyer mensuel',
    garant: 'Garant',
    decision: 'Décision de l’agence',
    nonRenseigne: 'Non renseigné',
    statuts: {
      complet: 'Dossier complet, décision en attente',
      garant_insuffisant: 'Dossier complet, solvabilité inférieure au seuil',
      transmis: 'Dossier retenu par l’agence',
      signe: 'Dossier retenu, acte signé',
    } as Record<string, string>,
    solvabilite: 'Solvabilité du garant',
    ratio: (valeur: string) => `${valeur} fois le loyer`,
    ratioAttente: 'Ratio non encore calculé',
    seuil: (valeur: string) => `Seuil retenu par l’agence : ${valeur} fois le loyer.`,
    atteint: 'Seuil atteint',
    nonAtteint: 'Seuil non atteint',
    calcule: (date: string) => `Calculé le ${date}.`,
    groupe: (valeur: string, reference: string) =>
      `Deux garants s’engagent pour ce logement. Solvabilité des deux garants ensemble : ${valeur} fois le loyer (dossier lié ${reference}).`,
    groupeAttente: (reference: string) =>
      `Deux garants s’engagent pour ce logement (dossier lié ${reference}). Leur solvabilité commune n’est pas encore calculée.`,
    ratioNote:
      'Le ratio rapporte le revenu net mensuel déclaré par le garant au loyer. Le montant de ce revenu n’est pas communiqué.',
    engagement: 'Engagement du garant',
    engagementAucun: 'Le garant n’a pas encore précisé son engagement.',
    nature: 'Nature',
    solidaire: 'Cautionnement solidaire',
    simple: 'Cautionnement simple',
    couvre: 'Couverture',
    couvertures: { loyer: 'Loyer seul', loyer_charges: 'Loyer et charges' } as Record<
      string,
      string
    >,
    plafond: 'Plafond de l’engagement',
    sansPlafond: 'Non précisé',
    duree: 'Durée',
    jusquAu: (date: string) => `Jusqu’au ${date}`,
    dureeDuBail: 'Durée du bail',
    mention: 'Mention personnelle',
    mentionEcrite: (date: string) => `Saisie par le garant le ${date}`,
    mentionAbsente: 'Pas encore saisie',
    pieces: 'Pièces examinées par l’agence',
    piecesAucune: 'Aucune pièce au dossier.',
    documents: (n: number) => (n > 1 ? `${n} documents` : '1 document'),
    examens: {
      examine: 'Examiné',
      a_revoir: 'À revoir',
      a_examiner: 'Non examiné',
    },
    examineLe: (date: string) => `Examiné le ${date}`,
    bilan: (examinees: number, total: number) =>
      `${examinees} nature${examinees > 1 ? 's' : ''} de pièces sur ${total} examinée${examinees > 1 ? 's' : ''} par un collaborateur de l’agence.`,
    piecesNote:
      'L’examen porte sur la lisibilité et la complétude des pièces. Il ne certifie pas leur authenticité.',
    acte: 'Acte de cautionnement',
    actes: {
      aucun: 'Pas encore préparé dans Cloison.',
      preparation: 'En préparation.',
      en_cours: 'Signature électronique en cours.',
      archive: 'Signé électroniquement. L’acte et sa preuve sont archivés.',
      incertain: 'Signature en cours de vérification.',
      signe: 'Signé.',
    },
    pied: 'Ce document ne contient aucun justificatif. Les pièces du garant restent chiffrées dans le coffre de Cloison et ne sont consultées que par l’agence. Exemplaire nominatif : son téléchargement est inscrit au journal du dossier.',
  },
}
