import 'server-only'

import { DUREE_JETON_SECONDES, verifierSignature, type Capacite, type Partie } from './jeton'

/**
 * Les autres dossiers ouverts dans ce navigateur.
 *
 * Le cookie de capacite ne porte qu'un jeton : celui du dossier affiche. Une
 * personne garante de deux dossiers, ou locataire de l'un et garante de
 * l'autre, perdait le premier en ouvrant le lien du second et devait
 * recliquer son courriel a chaque bascule. Les jetons deplaces attendent ici,
 * chacun dans son cookie `HttpOnly`, et se rouvrent d'un geste.
 *
 * Ces cookies n'autorisent rien : aucune page ne les lit pour decider d'un
 * acces. Un jeton n'agit qu'une fois redevenu le cookie de capacite, apres les
 * deux verifications habituelles (signature et `jti`).
 */
export const NOMS_AUTRES_DOSSIERS = ['cloison_autre_1', 'cloison_autre_2', 'cloison_autre_3']

const cle = (c: Capacite) => `${c.dossierId}/${c.partie}`

/**
 * Les jetons a garder a cote de celui qui devient actif.
 *
 * L'ancien jeton actif passe en tete, puis les autres dans leur ordre. Un
 * jeton illisible ou expire disparait, comme tout doublon du dossier actif :
 * un meme dossier et un meme role n'occupent jamais deux places.
 */
export async function rangerLesAutres(
  actif: Capacite,
  ancienActif: string | undefined,
  autres: (string | undefined)[],
): Promise<string[]> {
  const gardes: string[] = []
  const vus = new Set([cle(actif)])
  for (const jeton of [ancienActif, ...autres]) {
    if (!jeton) continue
    const capacite = await verifierSignature(jeton)
    if (!capacite || vus.has(cle(capacite))) continue
    vus.add(cle(capacite))
    gardes.push(jeton)
    if (gardes.length === NOMS_AUTRES_DOSSIERS.length) break
  }
  return gardes
}

/** Les cookies a poser pour refleter la liste, places vides effacees comprises. */
export function cookiesDesAutres(jetons: string[], securise: boolean) {
  return NOMS_AUTRES_DOSSIERS.map((name, i) => ({
    name,
    value: jetons[i] ?? '',
    httpOnly: true,
    secure: securise,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: jetons[i] ? DUREE_JETON_SECONDES : 0,
  }))
}

/**
 * Ce que le cadre affiche : la place et le role de chaque autre dossier.
 *
 * Verification hors ligne seulement, pour ne pas interroger la base a chaque
 * page : la revocation est controlee au moment de rouvrir le dossier.
 */
export async function autresDossiers(
  lire: (nom: string) => string | undefined,
): Promise<{ place: number; partie: Partie }[]> {
  const liste: { place: number; partie: Partie }[] = []
  for (const [place, nom] of NOMS_AUTRES_DOSSIERS.entries()) {
    const jeton = lire(nom)
    const capacite = jeton ? await verifierSignature(jeton) : null
    if (capacite) liste.push({ place, partie: capacite.partie })
  }
  return liste
}
