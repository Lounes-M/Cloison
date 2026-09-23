export const facturation = {
  etiquette: 'Gestion agence',
  lien: 'Règlements',
  titre: 'Règlements des actes',
  explication:
    'Un règlement est créé après la signature et l’archivage complet. Aucun règlement agence n’est créé en sandbox.',
  aucun: 'Aucun acte à régler.',
  payer: 'Régler par carte',
  suite: 'Page suivante',
  retour: 'Retour à l’espace agence',
  indisponible:
    'Le paiement n’a pas pu être confirmé. Le suivi reste disponible ; aucun nouvel essai incertain ne sera créé.',
  suspendu: 'Le règlement en ligne n’est pas encore ouvert.',
  anomalie: 'Rapprochement à examiner',
  etats: {
    a_regler: 'À régler',
    reserve: 'Paiement préparé',
    ouvert: 'Paiement en attente',
    paye: 'Réglé',
    rembourse: 'Remboursement à rapprocher',
    litige: 'Litige à examiner',
  } as Record<string, string>,
}
