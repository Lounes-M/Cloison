/** Configuration globale du site : importée par les métadonnées et la navigation. */
export const site = {
  name: 'Cloison',
  tagline: 'Le coffre à trois clés',
  description:
    "Cloison prépare le dossier de caution locative dans trois espaces séparés. Tu crées ton dossier, ton garant dépose ses pièces de son côté, l'agence reçoit un dossier complet. Personne ne voit ce qu'il ne doit pas voir.",
  // Resolue au build dans `next.config.ts` : domaine explicite, sinon domaine
  // de production Vercel, sinon localhost. Toujours definie.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  locale: 'fr_FR',
} as const

export const navLinks = [
  { label: 'Comment ça marche', href: '/#parcours' },
  { label: 'Produit', href: '/#produit' },
  { label: 'Tarifs', href: '/#tarifs' },
  { label: 'Agences', href: '/agences' },
] as const

export const footerLinks = [
  { label: 'Comment ça marche', href: '/#parcours' },
  { label: 'Produit', href: '/#produit' },
  { label: 'Tarifs', href: '/#tarifs' },
  { label: 'Agences', href: '/agences' },
] as const
