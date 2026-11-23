export const rappels = {
  titre: 'Relances et échéances',
  etiquette: 'Réglages de l’agence',
  retour: 'Retour aux dossiers',
  aide: 'Accompagnez les dépôts en attente et anticipez la suppression des justificatifs à leur échéance.',
  relance: 'Relancer le locataire et le garant après une période sans modification',
  echeance: 'Prévenir les collaborateurs avant l’échéance du dossier',
  desactive: 'Désactivé',
  jours: (n: number) => `${n} jours`,
  limites:
    'Les relances du garant concernent les dépôts incomplets et les corrections encore attendues. Celles du locataire concernent un dossier à régler, un garant à désigner ou un loyer à déclarer. Trois relances maximum par personne et par étape, espacées d’au moins trois jours. Une nouvelle activité reporte le rappel. Aucun nouveau lien n’est créé et aucune échéance n’est prolongée.',
  preferences:
    'Les rappels d’échéance, et l’alerte envoyée quand les trois relances d’un garant restent sans réponse, respectent les préférences personnelles de vos collaborateurs. Ils s’arrêtent après signature, refus ou expiration. Un courriel déjà transmis au fournisseur ne peut pas être rappelé.',
  cadence:
    'Les envois suivent les passages de maintenance et des limites partagées ; ils ne sont pas garantis à une heure précise.',
  confirmation: 'Je confirme les réglages de rappel de mon agence.',
  enregistrer: 'Enregistrer les rappels',
  attente: 'Enregistrement…',
  succes: 'Réglages enregistrés.',
  erreur: 'Réglages non enregistrés. Rechargez la page avant de réessayer.',
}
export type ReglagesRappels = {
  relance_jours: 0 | 3 | 7 | 14
  echeance_jours: 0 | 3 | 7
  revision: string | null
}
export const courrielsRappels = {
  depot: {
    sujet: 'Votre dépôt Cloison attend votre retour',
    texte:
      'Votre dépôt ou une correction demandée par votre agence reste en attente. Revenez dans votre espace avec votre lien habituel pour voir la prochaine étape. Si votre lien a expiré, demandez au locataire de vous en renvoyer un depuis son espace. Aucun justificatif ne doit être envoyé par courriel.',
  },
  echeance: {
    sujet: 'Un dossier Cloison approche de son échéance',
    texte:
      'Ce dossier approche de son échéance de conservation. Consultez-le dans votre espace si une action reste nécessaire. Les justificatifs seront supprimés à l’échéance ; ce rappel ne prolonge pas leur conservation.',
  },
  epuise: {
    sujet: 'Un garant n’a pas répondu aux relances Cloison',
    texte:
      'Le garant de ce dossier a reçu ses trois relances automatiques sans reprendre son dépôt. Cloison ne le relancera plus : un contact direct peut débloquer la situation. Le dossier porte la mention « Relances épuisées » dans votre espace.',
  },
  reference: 'Référence du dossier',
  expiration: 'Échéance de conservation',
}

/**
 * Les relances du locataire (migration 0089), tutoyé. Une par motif : le
 * dossier à régler, le garant à désigner, le loyer à déclarer. Le bouton mène
 * à la page publique où il peut redemander son lien, jamais à son dossier.
 */
export const courrielsRelanceLocataire = {
  paiement: {
    sujet: 'Ton dossier Cloison attend son règlement',
    texte:
      'Ton dossier est ouvert mais pas encore réglé : le lien de ton garant ne peut pas partir. Reviens dans ton espace avec ton lien habituel pour régler le dossier, puis désigner ton garant.',
  },
  garant: {
    sujet: 'Ton dossier Cloison attend ton garant',
    texte:
      'Tu n’as pas encore désigné ton garant. Reviens dans ton espace avec ton lien habituel et indique son adresse e-mail : il recevra un lien pour déposer ses pièces de son côté.',
  },
  loyer: {
    sujet: 'Ton dossier Cloison attend ton loyer',
    texte:
      'Le loyer de ton dossier n’est pas encore déclaré. Sans lui, le dossier reste en attente. Reviens dans ton espace avec ton lien habituel pour l’indiquer.',
  },
  lienExpire:
    'Si ton lien a expiré, demande-en un nouveau depuis « Retrouver mon dossier », avec la référence ci-dessous. Ce message ne prolonge pas la conservation du dossier.',
  bouton: 'Retrouver mon dossier',
  reference: 'Référence du dossier',
  expiration: 'Échéance de conservation',
}

/**
 * L’annonce de fin de dossier, envoyée sept jours avant l’échéance au
 * locataire (tutoyé) et au garant (vouvoyé). Elle ne dépend d’aucun réglage
 * d’agence et ne prolonge rien.
 */
export const courrielsFinDossier = {
  locataire: {
    sujet: 'Ton dossier Cloison arrive à échéance',
    texte:
      'Ton dossier arrive à la fin de sa durée de conservation. À la date ci-dessous, il sera fermé et les justificatifs de ton garant seront supprimés. Si la décision est encore en cours, préviens ton agence avant cette date. Passé ce délai, il faudra ouvrir un nouveau dossier. Ce message ne prolonge pas la conservation.',
  },
  garant: {
    sujet: 'Votre dossier Cloison arrive à échéance',
    texte:
      'Le dossier pour lequel vous vous portez garant arrive à la fin de sa durée de conservation. À la date ci-dessous, il sera fermé et vos justificatifs seront supprimés définitivement. Vous n’avez rien à faire. Si un dépôt ou une signature est encore attendu de votre part, faites-le avant cette date avec votre lien habituel. Ce message ne prolonge pas la conservation.',
  },
  reference: 'Référence du dossier',
  expiration: 'Échéance de conservation',
}
