/**
 * Ce que le parcours de signature attend d'un prestataire, et rien de plus.
 *
 * Le traitement des actes (`parcours.ts`) ne connait que cette interface :
 * creer une demande, y deposer le PDF, ajouter la caution comme signataire au
 * champ reserve par le modele, activer, puis recuperer l'acte signe et sa
 * preuve. Youtrust (`client-youtrust.ts`) en est la premiere implementation ;
 * un autre prestataire s'ajoute en ecrivant un adaptateur conforme, sans
 * toucher au registre des actes, a l'archivage ni a la facturation.
 *
 * Chaque methode qui ecrit chez le prestataire est appelee une seule fois par
 * reservation durable : l'adaptateur ne rejoue jamais un appel de lui-meme.
 */
import type { PositionSignature } from './position'

/** Le vocabulaire d'etat du registre, aligne sur celui de Youtrust. */
export type EtatDemandeSignature =
  | 'draft'
  | 'approval'
  | 'ongoing'
  | 'paused'
  | 'rejected'
  | 'declined'
  | 'canceled'
  | 'expired'
  | 'deleted'
  | 'done'

export type SignataireActe = PositionSignature & {
  prenom: string
  nom: string
  email: string
  /** Format international : l'OTP de la signature avancee part par SMS. */
  telephone: string
  /** Identifiant du document chez le prestataire, rendu par `ajouterDocument`. */
  document: string
}

export type PieceSignee = { pdf: Buffer; sha256: string }

export interface PrestataireSignature {
  /** `reference` est l'identifiant local de l'acte, pour le rapprochement. */
  creer(demande: {
    reference: string
    expiration: string
  }): Promise<{ id: string; status: EtatDemandeSignature }>
  ajouterDocument(demande: string, pdf: Uint8Array): Promise<{ id: string }>
  /** Signature electronique avancee, champ de 85 x 37 points a la position donnee. */
  ajouterSignataire(demande: string, signataire: SignataireActe): Promise<{ id: string }>
  activer(demande: string): Promise<{ id: string; status: EtatDemandeSignature }>
  /** L'acte signe et une preuve par signataire. L'appelant efface les tampons. */
  recupererPieces(
    demande: string,
    document: string,
    signataires: string[],
    signal?: AbortSignal,
  ): Promise<{ acte: PieceSignee; preuves: (PieceSignee & { signataire: string })[] }>
}
