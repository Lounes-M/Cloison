import type { MetadataRoute } from 'next'
import { LANGUES, lien, type Langue } from '@/lib/i18n'
import { site } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date()

  const pages = [
    { chemin: '/', changeFrequency: 'weekly', priority: 1 },
    { chemin: '/agences', changeFrequency: 'weekly', priority: 0.9 },
    { chemin: '/questions', changeFrequency: 'monthly', priority: 0.6 },
    { chemin: '/mentions-legales', changeFrequency: 'monthly', priority: 0.3 },
    { chemin: '/confidentialite', changeFrequency: 'monthly', priority: 0.3 },
    { chemin: '/conditions', changeFrequency: 'monthly', priority: 0.3 },
  ] as const
  const adresse = (langue: Langue, chemin: string) => {
    const relatif = lien(langue, chemin)
    return relatif === '/' ? site.url : `${site.url}${relatif}`
  }

  // Chaque page dans ses deux langues, chacune annoncant l'autre.
  return pages.flatMap((page) =>
    LANGUES.map((langue) => ({
      url: adresse(langue, page.chemin),
      lastModified: maintenant,
      changeFrequency: page.changeFrequency,
      priority: langue === 'fr' ? page.priority : Math.round(page.priority * 90) / 100,
      alternates: {
        languages: { fr: adresse('fr', page.chemin), en: adresse('en', page.chemin) },
      },
    })),
  )
}
