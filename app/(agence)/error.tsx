'use client'

import { EcranErreur } from '@/components/ui/EcranErreur'

export default function Erreur({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <EcranErreur error={error} region="div" />
}
