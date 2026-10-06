import 'server-only'
import { z } from 'zod'
import { clientAgence, utilisateurCourant } from '@/lib/acces/agence'
export const codesSecoursActifs = () => process.env.MFA_RECOVERY_CODES_ENABLED === 'true'
export const statutCodes = z
  .object({
    id: z.uuid(),
    type: z.literal('recovery_code'),
    total: z.number().int().min(1).max(100),
    remaining: z.number().int().min(0).max(100),
  })
  .refine((v) => v.remaining <= v.total)
export const lotCodes = z
  .object({
    id: z.uuid(),
    type: z.literal('recovery_code'),
    total: z.number().int().min(1).max(100),
    codes: z
      .array(z.string().regex(/^[a-z0-9]{16,64}$/))
      .min(1)
      .max(100),
  })
  .refine((v) => v.codes.length === v.total && new Set(v.codes).size === v.total)
export async function lireCodesSecours() {
  if (!codesSecoursActifs() || !(await utilisateurCourant()))
    return { etat: 'indisponible' as const }
  const db = await clientAgence()
  const niveau = await db.auth.mfa.getAuthenticatorAssuranceLevel()
  if (niveau.error || niveau.data?.currentLevel !== 'aal2') return { etat: 'indisponible' as const }
  const r = await db.auth.mfa.recoveryCodes.getStatus()
  if (r.error?.code === 'mfa_factor_not_found') return { etat: 'absent' as const }
  const lecture = statutCodes.safeParse(r.data)
  return !r.error && lecture.success
    ? { etat: 'pret' as const, restant: lecture.data.remaining, id: lecture.data.id }
    : { etat: 'indisponible' as const }
}
