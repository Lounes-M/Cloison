export const preferences = {
  titre: 'Mes notifications',
  etiquette: 'Préférences personnelles',
  retour: 'Retour aux dossiers',
  aide: 'Choisissez les courriels de suivi que vous souhaitez recevoir pour votre agence.',
  choix: 'Notifications de suivi',
  modes: {
    tous: 'Tous les dossiers de mon agence',
    mes: 'Uniquement les dossiers dont je suis responsable',
    aucun: 'Aucun courriel de suivi',
  },
  limites:
    'Ce réglage concerne les dossiers complets, les garants insuffisants et les remplacements à examiner. Les messages de connexion, de sécurité et de paiement restent actifs. Les notifications déjà préparées peuvent encore arriver.',
  mes: 'Le choix « uniquement mes dossiers » utilise le responsable au moment de préparer le courriel. Il ne renvoie pas les anciennes notifications après une réattribution.',
  confirmation: 'Je confirme mes préférences de notifications.',
  enregistrer: 'Enregistrer mes préférences',
  attente: 'Enregistrement…',
  succes: 'Préférences enregistrées.',
  erreur: 'Préférences non enregistrées. Rechargez la page avant de réessayer.',
}
export type PreferenceNotifications = { mode: 'tous' | 'mes' | 'aucun'; revision: string | null }
