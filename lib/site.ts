/** Configuration globale du site — importée par les métadonnées et la navigation. */
export const site = {
  name: 'Cloison',
  tagline: 'Le coffre à trois clés',
  description:
    "Cloison prend la caution locative de A à Z. Le garant dépose ses pièces chez lui, le locataire voit un feu vert, l'agence signe. Personne ne voit ce qu'il ne doit pas voir.",
  // Resolue au build dans `next.config.ts` : domaine explicite, sinon domaine
  // de production Vercel, sinon localhost. Toujours definie.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  locale: 'fr_FR',
} as const

export const navLinks = [
  { label: 'Produit', href: '/#produit' },
  { label: 'Tarifs', href: '/#tarifs' },
  { label: 'Agences', href: '/agences' },
] as const

export const footerLinks = [
  { label: 'Produit', href: '/#produit' },
  { label: 'Tarifs', href: '/#tarifs' },
  { label: 'Agences', href: '/agences' },
] as const
