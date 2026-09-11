import { z } from 'zod'
import { ouvrir, sceller } from '@/lib/coffre/enveloppe'
export const schemaBrouillon = z
  .object({
    profil: z.enum(['salarie', 'independant', 'retraite']),
    couvre: z.enum(['loyer', 'loyer_charges']),
    montant: z.string().max(32),
    revenu: z.string().max(32),
    jusquAu: z.string().max(10),
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
  return sceller(
    Buffer.from(
      JSON.stringify({
        usage: 'brouillon-engagement-v1',
        dossier,
        version,
        saisie: schemaBrouillon.parse(saisie),
      }),
    ),
    cle,
  )
}
export function dechiffrerBrouillon(
  chiffre: Buffer,
  dossier: string,
  version: number,
  cle: Buffer,
): SaisieBrouillon {
  if (chiffre.length > 4096) throw new Error('Brouillon invalide')
  const brut = JSON.parse(ouvrir(chiffre, cle).toString('utf8'))
  if (
    brut.usage !== 'brouillon-engagement-v1' ||
    brut.dossier !== dossier ||
    brut.version !== version
  )
    throw new Error('Brouillon invalide')
  return schemaBrouillon.parse(brut.saisie)
}
