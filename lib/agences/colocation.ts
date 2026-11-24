import { z } from 'zod'

/**
 * Ce qu'une agence saisit pour ouvrir une colocation, ou y ajouter quelqu'un.
 *
 * Pur : ni base, ni session. La base repete chaque regle (0092) ; ceci sert a
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
 * Combien de colocataires couvre le garant d'un dossier (0094). Un : chacun
 * son garant. Plus : un garant commun, un seul dossier et un seul acte.
 */
export function lireGarantis(saisie: unknown): number | null {
  const brut = String(saisie ?? '').trim()
  if (brut === '') return 1
  if (!/^[1-8]$/.test(brut)) return null
  return Number(brut)
}

/**
 * Le loyer que porte chaque dossier.
 *
 * Bail solidaire : le loyer entier pour chacun. Sinon, des parts egales par
 * colocataire, dont la somme vaut exactement le total : les centimes qui
 * restent vont aux premiers, un par un. `garantis` dit combien de
 * colocataires couvre chaque dossier : celui d'un garant commun porte autant
 * de parts.
 */
export function repartirLoyer(
  totalCents: number,
  etendue: 'part' | 'loyer_entier',
  garantis: number[],
): number[] {
  if (etendue === 'loyer_entier') return garantis.map(() => totalCents)
  const colocataires = garantis.reduce((s, n) => s + n, 0)
  const base = Math.floor(totalCents / colocataires)
  let reste = totalCents - base * colocataires
  return garantis.map((n) => {
    const centimes = Math.min(reste, n)
    reste -= centimes
    return base * n + centimes
  })
}
