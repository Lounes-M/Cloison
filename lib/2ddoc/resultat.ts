import { z } from 'zod'

/**
 * La reponse rendue a l'agence, relue telle quelle dans le navigateur.
 *
 * Deux etats seulement. Il n'existe pas d'etat « faux » : voir
 * `verification.ts`.
 */
const valeurs = z
  .object({
    annee: z.string().regex(/^(19|20)\d{2}$/),
    declarants: z.array(z.string().min(1).max(38)).min(1).max(2),
    revenuFiscalDeReference: z.string().regex(/^\d{1,12}$/),
    parts: z.string().regex(/^\d{1,3}([.,]\d{1,2})?$/),
    reference: z.string().regex(/^[0-9A-Z]{13}$/),
  })
  .partial()
  .strict()

export const verification2dDoc = z.discriminatedUnion('etat', [
  z
    .object({
      etat: z.literal('authentique'),
      emetteur: z.string().max(80),
      signeLe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      valeurs,
    })
    .strict(),
  z
    .object({
      etat: z.literal('non_verifiable'),
      motif: z.enum(['aucun_code', 'non_etabli']),
    })
    .strict(),
])

export type Verification2dDoc = z.infer<typeof verification2dDoc>
export type ValeursAvis = z.infer<typeof valeurs>
