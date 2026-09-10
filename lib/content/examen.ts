export const examen = {
  titre: 'Examen humain du document',
  aide: 'La présence d’un fichier et sa transcription par IA ne constituent pas un examen humain. Cette appréciation ne certifie pas l’authenticité du justificatif et ne change pas automatiquement le statut du dossier.',
  etats: {
    a_examiner: 'À examiner',
    examine: 'Examiné : lisible et complet',
    a_revoir: 'À revoir',
  },
  choix: 'Votre appréciation',
  confirmation: 'Je confirme mon appréciation de ce document après examen.',
  enregistrer: 'Enregistrer l’examen',
  attente: 'Enregistrement…',
  succes: 'Examen enregistré.',
  erreur:
    'Examen non enregistré. Rechargez le dossier : une autre personne a pu le modifier, la pièce être remplacée ou la limite de 20 changements par jour être atteinte.',
  ancien: 'Ancien collaborateur',
  par: ' par ',
  obsolete: 'Un remplacement a été demandé pour cette pièce. Examinez le nouveau document.',
  correction: 'Si un remplacement est nécessaire, utilisez la demande de complément.',
}
export type ExamenDocumentaire = {
  piece_id: string
  revision: string
  etat: keyof typeof examen.etats
  cree_le: string
  acteur: string | null
}
