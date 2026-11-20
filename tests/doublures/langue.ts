import { vi } from 'vitest'

/**
 * La langue des espaces vient d'un cookie, donc d'une requete : hors de Next,
 * `cookies()` leve. Les tests rendent pages et actions sans requete ; ils
 * lisent donc le francais, la langue par defaut, sauf le fichier qui pose sa
 * propre doublure pour verifier l'anglais.
 */
vi.mock('@/lib/langue-espace', async () => {
  const { estLangue } = await import('@/lib/i18n')
  return {
    langueEspace: async () => 'fr',
    langueAction: async (donnees?: FormData) => {
      const champ = donnees?.get('langue')
      return estLangue(champ) ? champ : 'fr'
    },
    poserLangue: async () => {},
    optionsCookieLangue: (langue: string) => ({ name: 'cloison_langue', value: langue }),
    titreEspace: async (fr: string) => ({ title: fr, robots: { index: false, follow: false } }),
  }
})
