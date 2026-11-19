import { Poppins } from 'next/font/google'

/**
 * La face de la marque, partagee par le layout racine et par
 * `global-error.tsx`, qui remplace ce layout et doit donc la redeclarer.
 *
 * Poppins, en quatre graisses : 400 pour le texte, 500 et 600 pour les
 * titres et les boutons, 700 pour les rares mises en avant.
 */
export const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

/** A poser sur `<html>` pour exposer les variables CSS de police. */
export const fontVariables = poppins.variable
