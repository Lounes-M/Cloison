import { z } from 'zod'

// La validation navigateur respecte la CSP sans sondage par new Function.
z.config({ jitless: true })

/** Contrat de restitution commun au serveur et au navigateur. Texte toujours inerte. */
export const resultatOcr = z
  .strictObject({
    pages: z
      .array(
        z.strictObject({ page: z.number().int().min(1).max(40), texte: z.string().max(24000) }),
      )
      .min(1)
      .max(40),
    modele: z
      .string()
      .max(150)
      .regex(/^[a-z0-9.-]+\/[a-z0-9._-]+$/),
    empreinte: z.string().regex(/^[a-f0-9]{64}$/),
    observeLe: z.iso.datetime(),
  })
  .refine(
    (r) =>
      r.pages.reduce((n, p) => n + p.texte.length, 0) <= 24000 &&
      r.pages.every((p, i) => i === 0 || p.page > r.pages[i - 1]!.page),
  )
export type ResultatOcr = z.infer<typeof resultatOcr>
