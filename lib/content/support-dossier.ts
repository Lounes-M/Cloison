export const aideDossier = {
  titre: 'Besoin d’aide sur ce dossier ?',
  aide: 'Préparez un message avec la référence et la catégorie du problème. Il sera envoyé uniquement après validation dans votre messagerie.',
  aidePorteur:
    'Prépare un message avec la référence et la catégorie du problème. Il sera envoyé uniquement après validation dans ta messagerie.',
  confidentialite:
    'Ne joignez aucun justificatif, montant, pièce d’identité ou lien d’accès. Le support ne consulte pas les documents à votre place.',
  confidentialitePorteur:
    'Ne joins aucun justificatif, montant, pièce d’identité ou lien d’accès. Le support ne consulte pas les documents à ta place.',
  categorie: 'Catégorie du problème',
  apercu: 'Message préparé',
  ouvrir: 'Ouvrir ma messagerie',
  copier: 'Copier le message',
  copie: 'Message copié. Il reste à l’envoyer dans votre messagerie.',
  copiePorteur: 'Message copié. Il reste à l’envoyer dans ta messagerie.',
  erreurCopie: 'Copie indisponible. Le message peut être sélectionné dans le champ ci-dessus.',
  destinataire: 'Adresse du support',
  reference: 'Référence du dossier',
  parcours: 'Espace utilisé',
  objet: 'Aide Cloison',
  invitation:
    'Décrivez ici le blocage, sans justificatif, montant, identité complète ni lien d’accès.',
  categories: {
    acces: 'Accès à mon espace',
    suivi: 'Suivi du dossier',
    paiement: 'Paiement du dossier locataire',
    depot: 'Dépôt ou remplacement d’un document',
    engagement: 'Saisie de mon engagement',
    examen: 'Examen des documents',
    equipe: 'Gestion des collaborateurs',
  },
  espaces: { agence: 'Agence', locataire: 'Locataire', garant: 'Garant' },
} as const
export type EspaceSupport = keyof typeof aideDossier.espaces
export type CategorieSupport = keyof typeof aideDossier.categories
export const categoriesSupport: Record<EspaceSupport, readonly CategorieSupport[]> = {
  agence: ['acces', 'suivi', 'examen', 'equipe'],
  locataire: ['acces', 'suivi', 'paiement'],
  garant: ['acces', 'suivi', 'depot', 'engagement'],
}
