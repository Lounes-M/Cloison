export const responsables = {
  titre: 'Responsable du dossier',
  aucun: 'Non attribué',
  indisponible: 'Collaborateur indisponible',
  choix: 'Attribuer à',
  confirmation: 'Je confirme cette affectation du dossier.',
  enregistrer: 'Enregistrer le responsable',
  prendre: 'M’attribuer ce dossier',
  liberer: 'Libérer ce dossier',
  attente: 'Enregistrement…',
  succes: 'Responsable enregistré.',
  erreur:
    'Affectation non enregistrée. Rechargez le dossier pour vérifier sa dernière version et les membres disponibles.',
  membre: 'Le responsable actuel ou un administrateur peut libérer ce dossier.',
  aide: 'Le responsable organise le suivi. Cette affectation ne change pas les droits de consultation des membres de l’agence.',
  precedent: 'Collaborateurs précédents',
  suivant: 'Collaborateurs suivants',
  navigation: 'Pages des collaborateurs disponibles',
  filtre: 'Prise en charge',
  filtres: { tous: 'Tous les dossiers', mes: 'Mes dossiers', sans: 'Sans responsable' },
  statut: 'État du dossier',
  tousStatuts: 'Tous les états',
}
export type ResponsableDossier = {
  dossier_id: string
  revision: string | null
  responsable_id: string | null
  responsable_email: string | null
  modifie_le: string | null
}
