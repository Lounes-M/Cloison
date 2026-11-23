import type { Metadata } from 'next'

import { EcranIntrouvable } from '@/components/ui/EcranIntrouvable'

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: false },
}

/** Un code de candidature inconnu, entre autres adresses du site public. */
export default function Introuvable() {
  return <EcranIntrouvable langueChoisie="fr" integre />
}
