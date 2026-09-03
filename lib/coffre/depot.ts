import 'server-only'

import { randomUUID } from 'node:crypto'

import { cleMaitresse } from './cle-maitresse'
import { ouvrir, nouvelleCle, sceller } from './enveloppe'
import { verifierContenu, type TypeAccepte } from './type-reel'

/**
 * Le depot d'une piece, de bout en bout.
 *
 * L'ordre des etapes n'est pas une commodite, c'est la moitie du travail.
 * Chacune peut echouer, et ce qui reste apres l'echec doit rester coherent.
 *
 * Ce module ne parle pas a Supabase. Il decrit ce dont il a besoin d'une base
 * (`DepotBase`), et `depot-supabase.ts` le realise. La raison est simple : le
 * branchement Supabase ne se verifie qu'avec un projet sous la main, alors que
 * les regles ci-dessous se verifient entierement avec une doublure, et ce sont
 * elles qui se trompent.
 */

/** La nature du document pour l'agence, distincte du type de ses octets. */
export type NatureDePiece =
  | 'bulletin_paie'
  | 'avis_imposition'
  | 'piece_identite'
  | 'justificatif_domicile'
  | 'contrat_travail'

export type PieceAInscrire = {
  dossierId: string
  nature: NatureDePiece
  chemin: string
  tailleOctets: number
  typeReel: TypeAccepte
}

/**
 * Ce que le depot attend d'une base, et rien de plus.
 *
 * `poserCleScellee` rend trois reponses et non un booleen : « deja » n'est pas
 * un echec, c'est une course perdue, et la suite en depend.
 */
export interface DepotBase {
  cleScellee(dossierId: string): Promise<Buffer | null>
  poserCleScellee(dossierId: string, scellee: Buffer): Promise<'posee' | 'deja' | 'echec'>
  televerser(chemin: string, scelle: Buffer): Promise<boolean>
  retirerObjet(chemin: string): Promise<void>

  /** Rend l'identifiant de la piece inscrite, ou rien si l'inscription a echoue. */
  inscrirePiece(piece: PieceAInscrire): Promise<string | null>

  journaliser(dossierId: string, action: 'piece_deposee', pieceId: string): Promise<boolean>
}

export type Resultat =
  { depose: true; chemin: string; pieceId: string } | { depose: false; raison: string }

/**
 * La cle de donnees du dossier, creee si elle n'existe pas encore.
 *
 * Le cas qui compte est la course. Deux depots simultanes sur un dossier neuf
 * tirent chacun une cle ; une seule sera rangee, l'autre perd. Sceller avec la
 * cle perdante donnerait une piece que plus rien n'ouvrirait, et rien ne le
 * signalerait avant que l'agence essaie de la lire.
 *
 * D'ou la regle : on ne scelle jamais avec une cle avant qu'elle soit
 * effectivement en base. Le perdant relit la gagnante et s'en sert.
 */
async function cleDuDossier(base: DepotBase, dossierId: string): Promise<Buffer> {
  const deja = await base.cleScellee(dossierId)
  if (deja) return ouvrir(deja, cleMaitresse())

  const candidate = nouvelleCle()
  const pose = await base.poserCleScellee(dossierId, sceller(candidate, cleMaitresse()))

  if (pose === 'posee') return candidate

  if (pose === 'deja') {
    const gagnante = await base.cleScellee(dossierId)
    if (gagnante) return ouvrir(gagnante, cleMaitresse())
  }

  throw new Error(`Impossible d'obtenir la cle du dossier ${dossierId}.`)
}

/**
 * Depose une piece : verifie, scelle, televerse, inscrit.
 *
 * Les octets partent avant la ligne, et jamais l'inverse. Des deux etats
 * incoherents possibles, on choisit le moins nuisible : un objet orphelin dans
 * Storage est invisible, chiffre et sans consequence, alors qu'une ligne sans
 * objet ferait voir a l'agence une piece qui ne s'ouvre pas. Et l'orphelin est
 * quand meme retire dans la foulee.
 */
export async function deposer(
  base: DepotBase,
  dossierId: string,
  nature: NatureDePiece,
  contenu: Buffer,
): Promise<Resultat> {
  const verdict = verifierContenu(contenu)
  if (!verdict.accepte) return { depose: false, raison: verdict.raison }

  const cle = await cleDuDossier(base, dossierId)

  // Le nom est tire au hasard et ne reprend rien de ce que la personne a
  // depose. Un nom de fichier d'origine porte souvent une identite, et il est
  // de toute facon choisi par un inconnu : ce sont deux raisons de ne pas le
  // garder.
  const chemin = `${dossierId}/${randomUUID()}`

  if (!(await base.televerser(chemin, sceller(contenu, cle)))) {
    return { depose: false, raison: "Le depot n'a pas abouti. Reessaie dans un instant." }
  }

  const pieceId = await base.inscrirePiece({
    dossierId,
    nature,
    chemin,
    // La taille en clair : c'est celle qui a du sens pour la personne et pour
    // les plafonds. Le scelle en fait vingt-huit de plus.
    tailleOctets: contenu.length,
    typeReel: verdict.type,
  })

  if (!pieceId) {
    await base.retirerObjet(chemin)
    return { depose: false, raison: "Le depot n'a pas abouti. Reessaie dans un instant." }
  }

  // Le journal vient apres, et son echec n'annule rien : la ligne `pieces`
  // est deja la trace du depot, et defaire un depot reussi parce qu'on n'a
  // pas su l'ecrire deux fois couterait a la personne une piece qu'elle
  // croyait posee.
  //
  // La regle s'inverse a l'ouverture d'une piece, ou le journal EST la trace :
  // la, on n'ouvre pas ce qu'on ne peut pas inscrire.
  if (!(await base.journaliser(dossierId, 'piece_deposee', pieceId))) {
    console.error('[coffre] depot non journalise', chemin)
  }

  return { depose: true, chemin, pieceId }
}
