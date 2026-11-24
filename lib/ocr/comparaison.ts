import { z } from 'zod'
import { PIECES_MAX, restitution, type Proposition } from './revenus'

/**
 * Le revenu declare par le garant face a ce qui se lit sur ses justificatifs.
 *
 * Module sans dependance serveur : le meme contrat borne la reponse et sa
 * relecture par le navigateur. La comparaison est une soustraction, faite ici
 * et pas par l'IA. Elle signale un ecart a verifier sur les pieces ; elle ne
 * note personne, ne propose aucune decision et n'est enregistree nulle part.
 */

/** En deca de 5 % du montant lu, un ecart tient de l'arrondi ou d'une prime. */
export const TOLERANCE_POUR_CENT = 5

export const ETATS_COMPARAISON = ['concordant', 'superieur', 'inferieur', 'illisible'] as const
export type EtatComparaison = (typeof ETATS_COMPARAISON)[number]

export type Ecart = {
  /** `superieur` : la declaration depasse les pieces. C'est l'ecart a verifier. */
  etat: EtatComparaison
  /** Declaration moins lecture, en centimes ; null si rien n'a pu etre lu. */
  ecartCents: number | null
  /** Valeur absolue de l'ecart, en pour cent du montant lu, arrondie. */
  ecartPourCent: number | null
}

export function comparerAuxPieces(declareCents: number, proposition: Proposition): Ecart {
  const lu = proposition.revenuCents
  if (lu === null || lu <= 0) return { etat: 'illisible', ecartCents: null, ecartPourCent: null }
  const ecartCents = declareCents - lu
  // Arithmetique entiere : le seuil ne depend d'aucun arrondi flottant.
  const hors = Math.abs(ecartCents) * 100 > TOLERANCE_POUR_CENT * lu
  return {
    etat: !hors ? 'concordant' : ecartCents > 0 ? 'superieur' : 'inferieur',
    ecartCents,
    ecartPourCent: Math.min(9999, Math.round((Math.abs(ecartCents) * 100) / lu)),
  }
}

const MAX_CENTS = 100_000_000

/** Ce que l'agence recoit : la declaration, le detail lu, l'ecart. Rien d'autre. */
export const comparaisonRevenus = z
  .strictObject({
    etat: z.enum(ETATS_COMPARAISON),
    declareCents: z.number().int().positive().max(MAX_CENTS),
    ecartCents: z.number().int().min(-MAX_CENTS).max(MAX_CENTS).nullable(),
    ecartPourCent: z.number().int().min(0).max(9999).nullable(),
    lecture: restitution.shape.proposition,
    pieces: z.number().int().min(1).max(PIECES_MAX),
    illisibles: z.number().int().min(0).max(PIECES_MAX),
    modele: restitution.shape.modele,
  })
  .refine((c) => (c.etat === 'illisible') === (c.lecture.revenuCents === null))
  .refine((c) => (c.ecartCents === null) === (c.etat === 'illisible'))
export type ComparaisonRevenus = z.infer<typeof comparaisonRevenus>
