import 'server-only'
import { env } from '@/lib/env'
import { FormulaireSupportDossier } from '@/components/forms/FormulaireSupportDossier'
import type { EspaceSupport } from '@/lib/content/support-dossier'
export function SupportDossier({
  reference,
  espace,
}: {
  reference: string
  espace: EspaceSupport
}) {
  if (!env.emailSupport) return null
  return (
    <FormulaireSupportDossier adresse={env.emailSupport} reference={reference} espace={espace} />
  )
}
