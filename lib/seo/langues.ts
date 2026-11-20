import type { Metadata } from 'next'

import { lien, type Langue } from '@/lib/i18n'

/**
 * Les adresses d'une page dans ses deux langues : la canonique est celle de
 * la langue affichee, et chaque version annonce l'autre aux moteurs.
 */
export function alternates(langue: Langue, chemin: string): NonNullable<Metadata['alternates']> {
  return {
    canonical: lien(langue, chemin),
    languages: { fr: lien('fr', chemin), en: lien('en', chemin), 'x-default': lien('fr', chemin) },
  }
}
