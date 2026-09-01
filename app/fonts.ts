import { Archivo, Archivo_Black } from 'next/font/google'

/**
 * Les deux faces de la marque, partagees par le layout racine et par
 * `global-error.tsx`, qui remplace ce layout et doit donc les redeclarer.
 */

export const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
})

export const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-archivo-black',
  display: 'swap',
})

/** A poser sur `<html>` pour exposer les variables CSS de police. */
export const fontVariables = `${archivo.variable} ${archivoBlack.variable}`
