import 'server-only'

import { cleMaitresse } from './cle-maitresse'
import { ouvrir } from './enveloppe'
import { rasteriser } from './rasterisation'
import type { TypeAccepte } from './type-reel'

/**
 * L'ouverture d'une piece par l'agence.
 *
 * L'ordre porte ici la meme importance qu'au depot, et il en est presque le
 * miroir. Au depot, l'echec du journal n'annule rien : la ligne `pieces` est
 * deja la trace. A l'ouverture, le journal EST la trace, et rien d'autre ne
 * dira jamais que ce document a ete regarde. On n'ouvre donc pas ce qu'on ne
 * peut pas inscrire.
 *
 * Consequence assumee : l'inscription precede le dechiffrement, si bien qu'une
 * panne plus loin laisse au journal une ouverture qui n'a pas abouti. C'est le
 * sens dans lequel on prefere se tromper. Un journal qui en dit trop se
 * corrige en le lisant ; un journal qui en dit trop peu ne se corrige pas.
 */

export type PieceOuvrable = {
  dossierId: string
  chemin: string
  typeReel: TypeAccepte
}

/**
 * Ce que l'ouverture attend d'une base.
 *
 * Chaque methode rend `null` quand l'appelant n'a pas le droit, sans le
 * distinguer d'une absence : c'est la RLS qui a decide, et lui faire dire
 * pourquoi renseignerait sur ce qui existe.
 */
export interface OuvertureBase {
  piece(pieceId: string): Promise<PieceOuvrable | null>
  cleScellee(dossierId: string): Promise<Buffer | null>
  telecharger(chemin: string): Promise<Buffer | null>
  journaliser(dossierId: string, action: 'piece_ouverte', pieceId: string): Promise<boolean>
}

export type Ouverture = { ouverte: true; pdf: Buffer } | { ouverte: false; raison: string }

/** Ce que la personne lit, et ce qu'on ne lui detaille pas. */
const INTROUVABLE = "Cette piece n'existe pas, ou tu n'y as pas acces."
const INDISPONIBLE = "Cette piece n'a pas pu etre ouverte. Reessaie dans un instant."

/**
 * Le texte du filigrane, ecrit a un seul endroit.
 *
 * Il nomme la personne et non seulement l'agence. C'est ce qui en fait un
 * dissuasif : une capture qui circule designe quelqu'un. Et cela n'expose rien
 * de neuf, puisque `journal_acces.acteur_id` enregistre deja precisement qui a
 * ouvert.
 */
export function filigranePour(qui: string, quand: Date = new Date()): string {
  const date = quand.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return `${qui} - ${date} - Cloison`
}

/**
 * Ouvre une piece et rend ce que l'AGENCE peut voir.
 *
 * Le nom porte la restriction, parce que l'ADR 0004 la pose explicitement : le
 * filigranage s'applique a la consultation par l'agence, jamais au depot. Le
 * garant qui relit son dossier relit ses documents, pas une copie marquee a son
 * nom, et son chemin ne passe donc pas par ici. Il reste a ecrire, avec
 * l'espace garant.
 *
 * Rend toujours un PDF rasterise et filigrane, jamais le document d'origine.
 * C'est ce detour qui detruit le contenu actif au passage, et sur quoi repose
 * le report de l'antivirus (voir `docs/dettes.md`).
 */
export async function ouvrirPiecePourLAgence(
  base: OuvertureBase,
  pieceId: string,
  filigrane: string,
): Promise<Ouverture> {
  const piece = await base.piece(pieceId)
  if (!piece) return { ouverte: false, raison: INTROUVABLE }

  // Avant tout dechiffrement, et sans rattrapage possible. `journaliser`
  // verifie elle-meme que l'appelant a acces au dossier : son refus est donc
  // aussi un controle d'acces, et non seulement une panne d'ecriture.
  if (!(await base.journaliser(piece.dossierId, 'piece_ouverte', pieceId))) {
    return { ouverte: false, raison: INTROUVABLE }
  }

  const scellee = await base.cleScellee(piece.dossierId)
  if (!scellee) return { ouverte: false, raison: INDISPONIBLE }

  const scelle = await base.telecharger(piece.chemin)
  if (!scelle) return { ouverte: false, raison: INDISPONIBLE }

  let contenu: Buffer
  try {
    // Deux ouvertures successives : la cle du dossier par la cle maitresse,
    // puis la piece par la cle du dossier. Un octet modifie a l'une ou l'autre
    // etape leve, plutot que de rendre des octets qu'on prendrait pour un
    // document.
    contenu = ouvrir(scelle, ouvrir(scellee, cleMaitresse()))
  } catch {
    console.error('[coffre] dechiffrement impossible')
    return { ouverte: false, raison: INDISPONIBLE }
  }

  try {
    return { ouverte: true, pdf: await rasteriser(contenu, piece.typeReel, filigrane) }
  } catch {
    // Un document que le moteur refuse ne repart pas en clair pour autant : ce
    // serait rendre a l'agence exactement ce qu'on s'emploie a ne pas lui
    // donner.
    console.error('[coffre] rasterisation impossible')
    return { ouverte: false, raison: INDISPONIBLE }
  }
}
