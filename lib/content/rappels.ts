export const rappels = {
  titre: 'Relances et échéances',
  etiquette: 'Réglages de l’agence',
  retour: 'Retour aux dossiers',
  aide: 'Accompagnez les dépôts en attente et anticipez la suppression des justificatifs à leur échéance.',
  relance: 'Relancer le garant après une période sans modification',
  echeance: 'Prévenir les collaborateurs avant l’échéance du dossier',
  desactive: 'Désactivé',
  jours: (n: number) => `${n} jours`,
  limites:
    'Les relances concernent les dépôts incomplets et les corrections encore attendues. Trois relances maximum par dossier, espacées d’au moins trois jours. Une nouvelle activité reporte le rappel. Aucun nouveau lien n’est créé et aucune échéance n’est prolongée.',
  preferences:
    'Les rappels d’échéance respectent les préférences personnelles de vos collaborateurs. Ils s’arrêtent après signature, refus ou expiration. Un courriel déjà transmis au fournisseur ne peut pas être rappelé.',
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
      'Votre dépôt ou une correction demandée par votre agence reste en attente. Revenez dans votre espace avec votre lien habituel pour voir la prochaine étape. Si votre lien a expiré, demandez un nouveau lien à votre agence. Aucun justificatif ne doit être envoyé par courriel.',
  },
  echeance: {
    sujet: 'Un dossier Cloison approche de son échéance',
    texte:
      'Ce dossier approche de son échéance de conservation. Consultez-le dans votre espace si une action reste nécessaire. Les justificatifs seront supprimés à l’échéance ; ce rappel ne prolonge pas leur conservation.',
  },
  reference: 'Référence du dossier',
  expiration: 'Échéance de conservation',
}
