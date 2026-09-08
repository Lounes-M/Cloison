import {
  natures,
  profilsRessources,
  engagement as texteEngagement,
  type ProfilRessources,
  type NatureValeur,
} from '@/lib/content/garant'

/**
 * Ce que le garant peut soumettre, et sous quelle forme.
 *
 * Pur : ni base, ni environnement, ni `next/headers`. Les actions serveur ne
 * font qu'appeler ceci puis le coffre, si bien que la partie qui se trompe se
 * teste sans rien d'autre.
 */

/**
 * Quatre megaoctets par fichier.
 *
 * La base en accepte vingt, et ce n'est pas une contradiction : la base est
 * la borne haute, celle-ci est la borne pratique. Vercel refuse tout corps de
 * requete au-dela de 4,5 Mo, et le chiffrement impose de passer par notre
 * serveur. Un peu de marge sous ce plafond pour l'enveloppe du formulaire.
 * Voir `docs/dettes.md`.
 */
export const TAILLE_MAX_DEPOT = 4 * 1024 * 1024

/** Cent millions d'euros : au-dela, c'est une faute de frappe, pas un plafond. */
const MONTANT_MAX_CENTS = 100_000_000 * 100

const VALEURS_DE_NATURE = new Set<string>(natures.map((n) => n.valeur))

export function natureDepuis(valeur: unknown): NatureValeur | null {
  return typeof valeur === 'string' && VALEURS_DE_NATURE.has(valeur)
    ? (valeur as NatureValeur)
    : null
}

export function nombreDocumentsDepuis(nature: NatureValeur, valeur: unknown): number | null {
  const texte = valeur == null ? '1' : valeur
  const maximum = nature === 'bulletin_paie' ? 3 : nature === 'bilan_comptable' ? 2 : 1
  return typeof texte === 'string' && /^[1-3]$/.test(texte) && Number(texte) <= maximum
    ? Number(texte)
    : null
}

export type Engagement = {
  profilRessources?: ProfilRessources
  couvre: 'loyer' | 'loyer_charges'
  montantMaxCents: number | null
  jusquAu: string | null
  solidaire: boolean
  /** Ce qu'on divise par le loyer. Nul tant que le garant ne l'a pas declare. */
  revenuNetMensuelCents: number | null
}

export type AnalyseEngagement =
  { ok: true; engagement: Engagement } | { ok: false; message: string }

/**
 * Un montant saisi par une personne, en centimes.
 *
 * Accepte ce que les gens tapent : « 1 200 », « 1200,50 », « 1 200,00 € ».
 * Refuse ce qui ne se lit pas sans deviner. Vide vaut « pas de plafond ».
 */
export function montantEnCents(saisie: string): number | null | 'invalide' {
  const nettoye = saisie
    .replace(/[\s  ]/g, '')
    .replace(/€/g, '')
    .replace(',', '.')

  if (nettoye === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(nettoye)) return 'invalide'

  const cents = Math.round(Number(nettoye) * 100)
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MONTANT_MAX_CENTS) return 'invalide'

  return cents
}

/** Une date `AAAA-MM-JJ` a venir, ou vide. */
function dateAVenir(saisie: string, aujourdHui: Date): string | null | 'invalide' {
  const propre = saisie.trim()
  if (propre === '') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(propre)) return 'invalide'

  const date = new Date(`${propre}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== propre) return 'invalide'

  const seuil = new Date(aujourdHui.toISOString().slice(0, 10))
  if (date.getTime() < seuil.getTime()) return 'invalide'

  return propre
}

export function analyserEngagement(
  champs: Record<string, string | undefined>,
  aujourdHui: Date = new Date(),
): AnalyseEngagement {
  const profil = champs.profil
  if (profil !== undefined && !profilsRessources.some((p) => p.valeur === profil))
    return { ok: false, message: texteEngagement.profilInvalide }
  const couvre = champs.couvre
  if (couvre !== 'loyer' && couvre !== 'loyer_charges') {
    return { ok: false, message: 'Indique ce que tu couvres.' }
  }

  const montantMaxCents = montantEnCents(champs.montant ?? '')
  if (montantMaxCents === 'invalide') {
    return { ok: false, message: 'Le montant ne se lit pas. Exemple : 1 200 ou 1200,50.' }
  }

  const jusquAu = dateAVenir(champs.jusquAu ?? '', aujourdHui)
  if (jusquAu === 'invalide') {
    return { ok: false, message: 'La date de fin doit etre a venir, au format AAAA-MM-JJ.' }
  }

  const revenuNetMensuelCents = montantEnCents(champs.revenu ?? '')
  if (revenuNetMensuelCents === 'invalide') {
    return { ok: false, message: 'Le revenu ne se lit pas. Exemple : 3 200 ou 3200,50.' }
  }

  return {
    ok: true,
    engagement: {
      ...(profil ? { profilRessources: profil as ProfilRessources } : {}),
      couvre,
      montantMaxCents,
      jusquAu,
      revenuNetMensuelCents,
      // Une case a cocher absente du formulaire vaut « non ». C'est le seul
      // champ ou l'absence a un sens, et il est explicite ici.
      solidaire: champs.solidaire === 'on' || champs.solidaire === 'true',
    },
  }
}

/** « 1,2 Mo », « 340 Ko » : ce que la personne lit a cote de sa piece. */
export function tailleLisible(octets: number): string {
  if (octets >= 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
  if (octets >= 1024) return `${Math.round(octets / 1024)} Ko`
  return `${octets} o`
}
