import { z } from 'zod'
import { celluleCSV } from '@/lib/agences/exports-registres'
import { statuts as statutsFr } from '@/lib/content/espace'
import { statuts as statutsEn } from '@/lib/content/en/espace'
import { tableauDeBord as tFr } from '@/lib/content/tableau-de-bord'
import { tableauDeBord as tEn } from '@/lib/content/en/tableau-de-bord'
import { choisir, type Langue } from '@/lib/i18n'

/**
 * Le tableau de bord de pilotage (migration 0099), cote application.
 *
 * Trois lectures SQL, validees ici avant tout affichage ou export : une
 * reponse inattendue vaut une panne, jamais un faux zero. Rien dans ce module
 * ne lit une adresse, un nom ou un montant : les fonctions SQL ne les rendent
 * pas, et les schemas ecartent toute colonne en trop.
 */

/** Les etapes d'un dossier en cours, dans l'ordre du parcours. */
export const ETAPES = [
  'ouvert',
  'depot_en_cours',
  'complet',
  'garant_insuffisant',
  'transmis',
  'signe',
  'refuse',
] as const
export type Etape = (typeof ETAPES)[number]

/** Les parties qu'un dossier peut attendre, l'agence d'abord : c'est a elle d'agir. */
export const PARTIES = ['agence', 'locataire', 'garant', 'signataires'] as const
export type Partie = (typeof PARTIES)[number]

/** Les motifs de blocage, ranges par partie attendue. */
export const MOTIFS_PAR_PARTIE = {
  agence: ['remplacement_a_examiner', 'decision_attendue'],
  locataire: ['paiement', 'garant_non_designe', 'loyer_non_declare'],
  garant: ['relances_epuisees', 'complement_attendu', 'depot_inacheve'],
  signataires: ['signature_attendue'],
} as const satisfies Record<Partie, readonly string[]>
export type Motif = (typeof MOTIFS_PAR_PARTIE)[Partie][number]
export const MOTIFS = PARTIES.flatMap((p) => MOTIFS_PAR_PARTIE[p]) as readonly Motif[]

const compteur = z.number().int().min(0).max(1_000_000)
const date = z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString())
const objet = <C extends string>(cles: readonly C[], valeur = compteur) =>
  z.object(Object.fromEntries(cles.map((c) => [c, valeur])) as Record<C, typeof valeur>)

const synthese = z.object({
  genere_le: date,
  etapes: objet(ETAPES),
  en_cours: compteur,
  echeances_proches: compteur,
  bloques: compteur,
  blocages: objet(MOTIFS),
  attendus: objet(PARTIES),
  seuils: objet(PARTIES, z.number().int().min(1).max(90)),
})
export type Synthese = z.infer<typeof synthese>

const bloque = z.object({
  id: z.uuid(),
  reference: z.string().min(1).max(64),
  statut: z.enum(ETAPES),
  motif: z.enum(MOTIFS as [Motif, ...Motif[]]),
  attend: z.enum(PARTIES),
  depuis: date,
  echeance_proche: z.boolean(),
})
export type DossierBloque = z.infer<typeof bloque>
export const LIMITE_BLOQUES = 500

const moyenne = z
  .union([z.number().min(0), z.string().regex(/^\d{1,6}(\.\d{1,12})?$/)])
  .nullable()
  .transform((v) => (v == null ? null : Number(v)))
const mois = z.object({
  mois: z.string().regex(/^\d{4}-\d{2}(-\d{2})?/),
  ouverts: compteur,
  complets: compteur,
  delai_complet_moyen_jours: moyenne,
  signes: compteur,
  signatures_mesurees: compteur,
  delai_signature_moyen_jours: moyenne,
  relances_garant: compteur,
  relances_locataire: compteur,
})
export type MoisPilotage = z.infer<typeof mois>

/** Chaque lecture rend sa valeur, ou null si la base a repondu autre chose. */
export function lireSynthese(donnees: unknown): Synthese | null {
  const r = synthese.safeParse(donnees)
  if (!r.success) return null
  // Un seul motif par dossier : les compteurs doivent s'additionner.
  const somme = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)
  return somme(r.data.blocages) === r.data.bloques && somme(r.data.attendus) === r.data.bloques
    ? r.data
    : null
}
export function lireBloques(donnees: unknown): DossierBloque[] | null {
  const r = z.array(bloque).max(LIMITE_BLOQUES).safeParse(donnees)
  return r.success ? r.data : null
}
export function lireMois(donnees: unknown): MoisPilotage[] | null {
  const r = z.array(mois).max(24).safeParse(donnees)
  return r.success ? r.data : null
}

const arrondi = (n: number) => Math.round(n * 10) / 10

/**
 * Les delais et les relances sur la periode. Les moyennes sont ponderees par
 * le nombre de dossiers mesures chaque mois, pas par le nombre de mois.
 */
export function totauxPilotage(lignes: MoisPilotage[]) {
  let complets = 0
  let joursComplets = 0
  let signatures = 0
  let joursSignatures = 0
  let relancesGarant = 0
  let relancesLocataire = 0
  for (const l of lignes) {
    if (l.complets > 0 && l.delai_complet_moyen_jours != null) {
      complets += l.complets
      joursComplets += l.delai_complet_moyen_jours * l.complets
    }
    if (l.signatures_mesurees > 0 && l.delai_signature_moyen_jours != null) {
      signatures += l.signatures_mesurees
      joursSignatures += l.delai_signature_moyen_jours * l.signatures_mesurees
    }
    relancesGarant += l.relances_garant
    relancesLocataire += l.relances_locataire
  }
  return {
    delaiCompletJours: complets === 0 ? null : arrondi(joursComplets / complets),
    delaiSignatureJours: signatures === 0 ? null : arrondi(joursSignatures / signatures),
    relancesGarant,
    relancesLocataire,
  }
}

/** Les jours entiers ecoules depuis la derniere activite. */
export function joursDepuis(depuis: string, maintenant: Date): number {
  return Math.max(0, Math.floor((maintenant.getTime() - Date.parse(depuis)) / 86400000))
}

const decimal = (n: number | null) => (n == null ? '' : arrondi(n).toString().replace('.', ','))
const fichier = (lignes: string[][], langue: Langue) =>
  '﻿' + lignes.map((l) => l.map((c) => celluleCSV(c, langue)).join(';')).join('\r\n') + '\r\n'

/** La synthese en CSV : une ligne par indicateur, aucun dossier. */
export function syntheseCSV(s: Synthese, lignes: MoisPilotage[], langue: Langue = 'fr'): string {
  const t = choisir(langue, tFr, tEn)
  const statuts = choisir(langue, statutsFr, statutsEn)
  const totaux = totauxPilotage(lignes)
  const r = t.csv.rubriques
  return fichier(
    [
      [...t.csv.synthese],
      [r.situation, t.csv.genere, s.genere_le],
      [r.situation, t.csv.enCours, String(s.en_cours)],
      [r.situation, t.csv.bloques, String(s.bloques)],
      [r.situation, t.csv.echeances, String(s.echeances_proches)],
      ...ETAPES.map((e) => [r.etapes, statuts[e]?.libelle ?? e, String(s.etapes[e])]),
      ...MOTIFS.map((m) => [r.blocages, t.blocages.motifs[m], String(s.blocages[m])]),
      ...PARTIES.map((p) => [r.parties, t.blocages.parties[p], String(s.attendus[p])]),
      [r.delais, t.csv.delaiComplet, decimal(totaux.delaiCompletJours)],
      [r.delais, t.csv.delaiSignature, decimal(totaux.delaiSignatureJours)],
      [r.relances, t.relances.garant, String(totaux.relancesGarant)],
      [r.relances, t.relances.locataire, String(totaux.relancesLocataire)],
    ],
    langue,
  )
}

/** Les dossiers bloques en CSV : la reference, jamais une personne. */
export function bloquesCSV(
  dossiers: DossierBloque[],
  langue: Langue = 'fr',
  maintenant = new Date(),
): string {
  const t = choisir(langue, tFr, tEn)
  const statuts = choisir(langue, statutsFr, statutsEn)
  const generation = maintenant.toISOString()
  return fichier(
    [
      [...t.csv.blocagesColonnes],
      ...dossiers.map((d) => [
        d.reference,
        statuts[d.statut]?.libelle ?? d.statut,
        t.blocages.motifs[d.motif],
        t.blocages.parties[d.attend],
        d.depuis,
        String(joursDepuis(d.depuis, maintenant)),
        d.echeance_proche ? t.csv.oui : t.csv.non,
        generation,
      ]),
    ],
    langue,
  )
}

/** Les douze mois en CSV. */
export function moisCSV(lignes: MoisPilotage[], langue: Langue = 'fr'): string {
  const t = choisir(langue, tFr, tEn)
  return fichier(
    [
      [...t.csv.moisColonnes],
      ...lignes.map((l) => [
        l.mois.slice(0, 7),
        String(l.ouverts),
        String(l.complets),
        decimal(l.delai_complet_moyen_jours),
        String(l.signes),
        decimal(l.delai_signature_moyen_jours),
        String(l.relances_garant),
        String(l.relances_locataire),
      ]),
    ],
    langue,
  )
}
