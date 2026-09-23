import 'server-only'
import { z } from 'zod'
export function configurationParcours() {
  if (process.env.SIGNATURE_PARCOURS_ENABLED !== 'true') return null
  if (process.env.YOUTRUST_REGISTRY_ENABLED !== 'true') throw new Error('Registre signature requis')
  const mode = z.enum(['sandbox', 'production']).parse(process.env.YOUTRUST_ENVIRONMENT)
  return {
    mode,
    modele: z.string().trim().min(1).max(120).parse(process.env.ACTE_MODELE_VERSION),
    jours: z.coerce.number().int().min(7).max(18250).parse(process.env.ACTE_CONSERVATION_JOURS),
  }
}
