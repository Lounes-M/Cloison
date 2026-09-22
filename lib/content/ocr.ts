export const ocr = {
  titre: 'Aide à la lecture',
  accord: 'Envoyer cette copie à OpenRouter et à son fournisseur IA pour en extraire le texte.',
  aide: 'La transcription peut être incomplète ou erronée. Comparez-la au document original. Elle ne vérifie ni son authenticité ni la solvabilité du garant.',
  lancer: 'Extraire le texte',
  attente: 'Lecture en cours…',
  erreur:
    'Lecture indisponible : accès, quota ou traitement impossible. Vous pouvez toujours ouvrir la pièce.',
  effacer: 'Effacer la transcription',
  temporaire: 'Résultat temporaire, non enregistré dans le dossier.',
  modele: 'Modèle',
  empreinte: 'Empreinte de la copie analysée',
  page: 'Page',
  pages: 'Pages à lire',
  pagesAide:
    'Laissez vide pour toutes les pages, ou indiquez par exemple 1, 3-5. Seules les pages choisies seront transmises, avec leur filigrane. 40 pages maximum.',
  pagesInvalides:
    'Indiquez des pages entre 1 et 40, séparées par des virgules, ou une plage comme 3-5.',
  accordSelection: (pages: string) =>
    `Envoyer uniquement les pages ${pages} de cette copie à OpenRouter et à son fournisseur IA pour en extraire le texte.`,
  interrompre: 'Interrompre la lecture',
  interrompue:
    'Lecture interrompue et résultat effacé. Les données déjà transmises au fournisseur ne peuvent pas être rappelées.',
  rechercher: 'Rechercher dans la transcription',
  aucunePage: 'Aucune page ne contient ce texte.',
  choisirPage: 'Page de la transcription',
  precedente: 'Page précédente',
  suivante: 'Page suivante',
  position: (index: number, total: number) => `Résultat ${index} sur ${total}`,
  vide: 'Aucun texte lisible restitué pour cette page.',
}
