import { z } from 'zod'
import { ouvrir, sceller } from '../coffre/enveloppe.ts'
export const schemaBrouillon = z
  .object({
    profil: z.enum(['salarie', 'independant', 'retraite']),
    couvre: z.enum(['loyer', 'loyer_charges']),
    montant: z.string().max(32),
    revenu: z.string().max(32),
    jusquAu: z.union([z.literal(''), z.iso.date()]),
    solidaire: z.boolean(),
  })
  .strict()
export type SaisieBrouillon = z.infer<typeof schemaBrouillon>
export function chiffrerBrouillon(
  saisie: SaisieBrouillon,
  dossier: string,
  version: number,
  cle: Buffer,
) {
  const clair = Buffer.from(
    JSON.stringify({
      usage: 'brouillon-engagement-v1',
      dossier,
      version,
      saisie: schemaBrouillon.parse(saisie),
    }),
  )
  try {
    return sceller(clair, cle)
  } finally {
    clair.fill(0)
  }
}
export function dechiffrerBrouillon(
  chiffre: Buffer,
  dossier: string,
  version: number,
  cle: Buffer,
): SaisieBrouillon {
  if (chiffre.length < 29 || chiffre.length > 4096) throw new Error('Brouillon invalide')
  const clair = ouvrir(chiffre, cle)
  try {
    const texte = clair.toString('utf8')
    if (!Buffer.from(texte).equals(clair)) throw new Error('Brouillon invalide')
    const brut = z
      .strictObject({
        usage: z.literal('brouillon-engagement-v1'),
        dossier: z.literal(dossier),
        version: z.literal(version),
        saisie: schemaBrouillon,
      })
      .parse(JSON.parse(texte))
    return brut.saisie
  } finally {
    clair.fill(0)
  }
}
