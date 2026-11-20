export const navigationMobile = { menu: 'Menu' } as const

export const barrePublics = {
  libelle: 'Cloison for:',
  aria: 'Audiences',
  liens: [
    { label: 'Tenants and guarantors', href: '/' },
    { label: 'Agencies', href: '/agences' },
    { label: 'FAQ', href: '/questions' },
  ],
  connexion: { label: 'Agency sign-in', href: '/connexion' },
  cta: 'Create my file',
} as const
