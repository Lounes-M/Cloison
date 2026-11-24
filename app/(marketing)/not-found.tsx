import type { Metadata } from 'next'

import { EcranIntrouvable } from '@/components/ui/EcranIntrouvable'

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: false },
}

/** Une adresse inconnue du site public, ou un code de candidature inconnu. */
export default function Introuvable() {
  return <EcranIntrouvable langue="fr" />
}
