import { fontVariables } from '@/app/fonts'
import type { Langue } from '@/lib/i18n'
import '@/app/globals.css'

/**
 * Le document, `<html>` et `<body>`, commun aux quatre layouts racines.
 *
 * Il y a un layout racine par groupe de routes, et non un seul pour tout le
 * site, pour une raison : la langue. `<html lang>` est ce que lit un lecteur
 * d'ecran avant tout le reste, titre de l'onglet compris, pour choisir sa
 * voix. Un layout unique ne connait pas l'adresse demandee et annoncait donc
 * le francais sur les pages anglaises (WCAG 3.1.1, RGAA 8.3). Chaque groupe
 * sait, lui, quelle langue il sert : le site public par son adresse, les
 * espaces par le choix de la personne.
 */
export function DocumentRacine({
  langue,
  children,
}: {
  langue: Langue
  children: React.ReactNode
}) {
  return (
    <html lang={langue} className={fontVariables}>
      <body>{children}</body>
    </html>
  )
}
