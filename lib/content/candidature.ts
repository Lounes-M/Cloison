/**
 * Le lien de candidature d'un logement (migration 0070).
 *
 * `agence` vouvoie l'agence ; `page` et `espace` tutoient le locataire.
 */
export const candidature = {
  agence: {
    titre: 'Lien de candidature',
    aide: 'Collez ce lien dans votre annonce. Le candidat qui l’utilise ouvre son dossier Cloison, qui rejoint directement ce logement et votre agence avec son accord. La page ne montre que le libellé, le loyer et le nom de l’agence.',
    nonVerifiee:
      'Le lien de candidature s’ouvre une fois votre agence vérifiée : le candidat doit savoir à qui il transmet son dossier.',
    ferme: 'Aucun lien ouvert pour ce logement.',
    champ: 'Lien à partager',
    ouvrir: 'Ouvrir un lien de candidature',
    renouveler: 'Changer de lien',
    renouvelerAide: 'Changer de lien rend l’ancien inutilisable.',
    fermer: 'Fermer le lien',
    archive: 'Le lien se ferme de lui-même quand le logement est archivé.',
  },
  page: {
    titre: 'Candidater pour ce logement',
    etiquette: 'Candidature',
    loyer: 'Loyer de référence',
    sansLoyer: 'Non renseigné',
    agence: 'Agence',
    intro: (agence: string) =>
      `Crée ton dossier Cloison : il sera transmis à ${agence} pour ce logement, et à personne d’autre.`,
    accord: (agence: string) =>
      `J’autorise ${agence} à consulter les informations et les pièces de mon dossier pour ce logement. Ce rattachement est définitif.`,
    dejaTitre: 'Tu as déjà un dossier ?',
    dejaTexte:
      'Ouvre ton espace avec le lien reçu par e-mail, puis colle ce lien ou son code dans la section « Candidater à un logement ».',
    code: 'Code de candidature',
    rattache: 'Ton dossier a rejoint ce logement. Ouvre le lien reçu par e-mail pour le compléter.',
    nonRattache:
      'Ton dossier est ouvert, mais il n’a pas pu rejoindre ce logement. Depuis ton espace, colle le lien de l’annonce dans la section « Candidater à un logement ».',
    invalideTitre: 'Ce lien ne fonctionne plus',
    invalideTexte:
      'Le logement a peut-être été attribué, ou l’agence a changé de lien. Demande-lui le lien à jour, ou crée ton dossier sans agence : tu pourras le lui transmettre plus tard.',
    invalideBouton: 'Créer mon dossier',
  },
  espace: {
    titre: 'Candidater à un logement',
    aide: 'Colle le lien de candidature de l’annonce, ou seulement son code. Ton dossier rejoindra ce logement et son agence.',
    champ: 'Lien ou code de candidature',
    consentement:
      'J’autorise l’agence de ce logement à consulter les informations et les pièces de mon dossier. Ce rattachement est définitif.',
    bouton: 'Candidater',
    envoi: 'Envoi…',
    succes: (agence: string) => `Ton dossier est transmis à ${agence} pour ce logement.`,
    erreur:
      'Cette candidature n’a pas abouti. Vérifie le lien : il a peut-être été fermé, ou ton dossier est déjà suivi par une autre agence.',
    accord: 'Coche la case d’accord pour transmettre ton dossier.',
  },
  erreurs: {
    accord: 'Coche la case d’accord pour que ton dossier rejoigne ce logement.',
  },
} as const
