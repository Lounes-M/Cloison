import type { Metadata } from 'next'

import { EcranIntrouvable } from '@/components/ui/EcranIntrouvable'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
}

export default function Introuvable() {
  return <EcranIntrouvable langueChoisie="en" integre />
}
