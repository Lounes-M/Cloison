import { z } from 'zod'

/**
 * Ce qu'une agence saisit pour ouvrir une colocation, ou y ajouter quelqu'un.
 *
 * Pur : ni base, ni session. La base repete chaque regle (0089) ; ceci sert a
 * rendre un message propre avant d'ouvrir quoi que ce soit, parce qu'un
 * dossier ouvert puis refuse par la colocation resterait un dossier isole.
 */
export const COLOCATAIRES_MAX = 8

const adresse = z.string().trim().toLowerCase().min(5).max(180).pipe(z.email())

export type AdressesLues =
  { ok: true; adresses: string[] } | { ok: false; motif: 'adresses' | 'doublon' | 'trop' }

/** Les adresses, une par ligne (ou separees par une virgule ou un point-virgule). */
export function lireAdresses(saisie: string, minimum: number): AdressesLues {
  const brutes = saisie
    .split(/[\n,;]/)
    .map((a) => a.trim())
    .filter(Boolean)
  if (brutes.length > COLOCATAIRES_MAX) return { ok: false, motif: 'trop' }
  const adresses: string[] = []
  for (const brute of brutes) {
    const lue = adresse.safeParse(brute)
    if (!lue.success) return { ok: false, motif: 'adresses' }
    if (adresses.includes(lue.data)) return { ok: false, motif: 'doublon' }
    adresses.push(lue.data)
  }
  if (adresses.length < minimum) return { ok: false, motif: 'adresses' }
  return { ok: true, adresses }
}

/**
 * Le loyer que porte le dossier de chaque colocataire.
 *
 * Bail solidaire : le loyer entier pour chacun. Sinon, des parts egales dont
 * la somme vaut exactement le total : les centimes qui restent vont aux
 * premiers, un par un.
 */
export function repartirLoyer(
  totalCents: number,
  etendue: 'part' | 'loyer_entier',
  colocataires: number,
): number[] {
  if (etendue === 'loyer_entier') return Array.from({ length: colocataires }, () => totalCents)
  const base = Math.floor(totalCents / colocataires)
  const reste = totalCents - base * colocataires
  return Array.from({ length: colocataires }, (_, i) => base + (i < reste ? 1 : 0))
}
