export const navigationMobile = { menu: 'Menu' } as const

/** La barre fine au-dessus de l’en-tete : les publics du site. */
export const barrePublics = {
  libelle: 'Cloison pour :',
  aria: 'Publics',
  liens: [
    { label: 'Locataires et garants', href: '/' },
    { label: 'Agences', href: '/agences' },
    { label: 'Questions', href: '/questions' },
  ],
  connexion: { label: 'Connexion agence', href: '/connexion' },
  cta: 'Créer mon dossier',
} as const
