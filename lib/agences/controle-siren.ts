import 'server-only'

import { fetchBorne } from '@/lib/http/fetch-borne'

/**
 * Le controle du SIREN declare, sur l'annuaire public des entreprises.
 *
 * C'est une aide a la decision, pas une decision : il dit a l'exploitant ce
 * que l'Etat sait de ce numero (il existe, il est en activite, son activite
 * est immobiliere, son nom ressemble a celui de l'agence), et l'exploitant
 * active a la main comme avant. La carte professionnelle n'est pas dans cet
 * annuaire : elle reste verifiee a la main.
 *
 * Trois regles tiennent le reste :
 *  - rien de ce controle ne revient a l'agence, ni ne bloque sa demande ;
 *  - une panne de l'annuaire donne « indisponible », jamais une erreur ;
 *  - seul le SIREN part, vers un service de l'Etat, sans cle ni compte.
 */

const ANNUAIRE = 'https://recherche-entreprises.api.gouv.fr/search'

export type ControleSiren =
  | { etat: 'indisponible' }
  | { etat: 'introuvable'; cleValide: boolean }
  | {
      etat: 'trouve'
      nom: string
      enActivite: boolean
      fermeeLe: string | null
      creeeLe: string | null
      activite: string | null
      activiteImmobiliere: boolean
      commune: string | null
      nomProche: boolean
    }

/** La cle de Luhn d'un SIREN : une faute de frappe la casse neuf fois sur dix. */
export function cleSirenValide(siren: string): boolean {
  if (!/^\d{9}$/.test(siren)) return false
  let somme = 0
  for (let i = 0; i < 9; i++) {
    let chiffre = Number(siren[8 - i])
    if (i % 2 === 1) {
      chiffre *= 2
      if (chiffre > 9) chiffre -= 9
    }
    somme += chiffre
  }
  return somme % 10 === 0
}

/** Les mots qui ne distinguent aucune agence d'une autre. */
const MOTS_CREUX = new Set([
  'agence',
  'agences',
  'immobilier',
  'immobiliere',
  'immobilieres',
  'immo',
  'gestion',
  'groupe',
  'cabinet',
  'societe',
  'sas',
  'sasu',
  'sarl',
  'eurl',
  'sci',
  'les',
  'des',
  'the',
  'and',
])

function mots(texte: string): Set<string> {
  return new Set(
    texte
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((mot) => mot.length >= 3 && !MOTS_CREUX.has(mot)),
  )
}

/** Vrai si un mot distinctif du nom de l'agence se retrouve dans un nom connu de l'annuaire. */
export function nomsProches(nomAgence: string, nomsAnnuaire: string[]): boolean {
  const attendus = mots(nomAgence)
  if (attendus.size === 0) return false
  const connus = mots(nomsAnnuaire.join(' '))
  for (const mot of attendus) if (connus.has(mot)) return true
  return false
}

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur.trim() !== '' ? valeur.trim().slice(0, 200) : null

const objet = (valeur: unknown): Record<string, unknown> =>
  typeof valeur === 'object' && valeur !== null ? (valeur as Record<string, unknown>) : {}

export async function controlerSiren(siren: string, nomAgence: string): Promise<ControleSiren> {
  if (!/^\d{9}$/.test(siren)) return { etat: 'indisponible' }

  let corps: unknown
  try {
    const reponse = await fetchBorne(`${ANNUAIRE}?q=${siren}&page=1&per_page=5`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    if (!reponse.ok) return { etat: 'indisponible' }
    corps = await reponse.json()
  } catch {
    return { etat: 'indisponible' }
  }

  const resultats = objet(corps).results
  if (!Array.isArray(resultats)) return { etat: 'indisponible' }

  // La recherche est plein texte : on ne retient que l'unite dont le SIREN est
  // exactement celui declare, jamais « le premier resultat ».
  const unite = resultats.map(objet).find((resultat) => resultat.siren === siren)
  if (!unite) return { etat: 'introuvable', cleValide: cleSirenValide(siren) }

  const siege = objet(unite.siege)
  const enseignes = Array.isArray(siege.liste_enseignes)
    ? siege.liste_enseignes.filter((e): e is string => typeof e === 'string')
    : []
  const noms = [
    chaine(unite.nom_complet),
    chaine(unite.nom_raison_sociale),
    chaine(unite.sigle),
    chaine(siege.nom_commercial),
    ...enseignes,
  ].filter((nom): nom is string => nom !== null)

  const activite = chaine(unite.activite_principale)

  return {
    etat: 'trouve',
    nom: noms[0] ?? '(sans nom)',
    enActivite: unite.etat_administratif === 'A',
    fermeeLe: chaine(unite.date_fermeture),
    creeeLe: chaine(unite.date_creation),
    activite,
    // Division 68 de la NAF : activites immobilieres (68.31Z agences, 68.32A
    // administration de biens...).
    activiteImmobiliere: activite !== null && /^68/.test(activite),
    commune: chaine(siege.libelle_commune),
    nomProche: nomsProches(nomAgence, noms),
  }
}

/** Les lignes du courriel d'activation : ce que l'annuaire dit, et ce qui reste a faire. */
export function lignesControleSiren(controle: ControleSiren): string[] {
  const titre = 'Controle automatique du SIREN (annuaire des entreprises) :'

  if (controle.etat === 'indisponible') {
    return [titre, '  [?] Annuaire injoignable : controle non fait, a verifier a la main.']
  }

  if (controle.etat === 'introuvable') {
    return [
      titre,
      '  [!] Aucune entreprise a ce numero dans l’annuaire.',
      controle.cleValide
        ? '      Le numero est bien forme : entreprise tres recente ou non diffusible, a verifier.'
        : '      Sa cle de controle est fausse : probablement une faute de frappe.',
    ]
  }

  const signe = (bon: boolean) => (bon ? '[ok]' : '[!] ')
  return [
    titre,
    `  ${signe(true)} Existe : ${controle.nom}` +
      (controle.commune ? `, ${controle.commune}` : '') +
      (controle.creeeLe ? `, creee le ${controle.creeeLe}` : ''),
    `  ${signe(controle.enActivite)} ` +
      (controle.enActivite
        ? 'En activite'
        : `Cessee${controle.fermeeLe ? ` le ${controle.fermeeLe}` : ''}`),
    `  ${signe(controle.activiteImmobiliere)} Activite ${controle.activite ?? 'inconnue'} : ` +
      (controle.activiteImmobiliere ? 'immobiliere' : 'pas une activite immobiliere'),
    `  ${signe(controle.nomProche)} ` +
      (controle.nomProche
        ? 'Le nom ressemble a celui de l’agence'
        : 'Le nom ne ressemble pas a celui de l’agence'),
    '  La carte professionnelle et le domaine restent a verifier a la main.',
  ]
}
