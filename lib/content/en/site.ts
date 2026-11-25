/** Les textes globaux du site, en anglais. La forme suit `lib/site.ts`. */
export const site = {
  name: 'Cloison',
  tagline: 'The three-key vault',
  description:
    'Cloison prepares the rental guarantee file in three separate spaces. You create your file, your guarantor uploads their documents on their side, and the agency receives a complete file. Nobody sees what they should not see.',
  locale: 'en_GB',
} as const

export const navLinks = [
  { label: 'How it works', href: '/#parcours' },
  { label: 'Product', href: '/#produit' },
  { label: 'Pricing', href: '/#tarifs' },
  { label: 'Agencies', href: '/agences' },
  { label: 'Sign in', href: '/connexion' },
] as const

export const footerLinks = [
  { label: 'How it works', href: '/#parcours' },
  { label: 'Product', href: '/#produit' },
  { label: 'Pricing', href: '/#tarifs' },
  { label: 'Agencies', href: '/agences' },
  { label: 'How we use AI', href: '/intelligence-artificielle' },
  { label: 'FAQ', href: '/questions' },
  { label: 'Agency sign-in', href: '/connexion' },
  { label: 'Find my file', href: '/lien-invalide' },
  { label: 'Legal notice', href: '/mentions-legales' },
  { label: 'Privacy', href: '/confidentialite' },
  { label: 'Terms', href: '/conditions' },
] as const

/** Les libelles d’interface qui ne vivent dans aucun fichier de contenu. */
export const chrome = {
  navigationPrincipale: 'Main navigation',
  navigationPied: 'Footer navigation',
  logo: 'Cloison, home',
  langue: 'Language',
  principe: 'The principle',
  principeTexte:
    'One shared file, three separate spaces. The tenant follows, the guarantor uploads, the agency reviews.',
  principeNote: 'The guarantor never pays anything.',
  pauseAnimations: 'Pause animations',
  relancerAnimations: 'Resume animations',
} as const
