export const authenticite = {
  titre: 'Code 2D-Doc de l’avis',
  aide: 'L’administration imprime sur chaque avis un code signé, le 2D-Doc. Cloison le lit et vérifie sa signature. Aucune IA n’intervient et rien de la pièce n’est transmis à un tiers.',
  lancer: 'Vérifier le code',
  attente: 'Vérification en cours…',
  erreur:
    'Vérification indisponible : accès, quota ou traitement impossible. Vous pouvez toujours ouvrir la pièce.',
  authentique: 'Code authentique',
  authentiqueAide:
    'Ce code a bien été signé par l’émetteur ci-dessous. Il ne dit rien du reste de la page : comparez les valeurs signées à celles imprimées sur l’avis.',
  nonVerifiable: 'Non vérifiable',
  aucunCode:
    'Aucun code 2D-Doc lisible sur cette pièce. C’est courant avec une photo, un scan ou un document ancien, et cela ne dit rien de la pièce.',
  nonEtabli:
    'Un code a été lu, mais sa signature n’a pas pu être confirmée auprès d’un émetteur reconnu. Cela ne suffit pas à conclure : examinez la pièce comme d’habitude.',
  emetteur: 'Émetteur',
  signeLe: 'Signé le',
  annee: 'Année des revenus',
  declarants: 'Déclarant(s)',
  revenuFiscalDeReference: 'Revenu fiscal de référence',
  parts: 'Nombre de parts',
  reference: 'Référence de l’avis',
  sansValeur: 'Les valeurs signées n’ont pas pu être détaillées pour ce code.',
  temporaire: 'Résultat temporaire, non enregistré dans le dossier. La décision vous appartient.',
  effacer: 'Effacer le résultat',
}
