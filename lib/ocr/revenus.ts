import { z } from 'zod'

// La validation navigateur respecte la CSP sans sondage par new Function.
z.config({ jitless: true })

/**
 * Ce qu'une IA peut proposer au garant a partir de ses justificatifs de revenus.
 *
 * Module sans dependance serveur : le meme contrat valide la reponse du
 * fournisseur, la restitution au navigateur et le calcul de la proposition.
 * Aucune valeur n'est ecrite dans le dossier ici : la proposition s'affiche, le
 * garant la reporte dans son champ et enregistre lui-meme.
 */

export const NATURES_LISIBLES = ['bulletin_paie', 'pension_retraite'] as const
export type NatureLisible = (typeof NATURES_LISIBLES)[number]
export const estNatureLisible = (nature: unknown): nature is NatureLisible =>
  typeof nature === 'string' && (NATURES_LISIBLES as readonly string[]).includes(nature)

/** Au plus quatre fichiers par demande : trois bulletins et une pension. */
export const PIECES_MAX = 4

const montant = z.string().regex(/^\d{1,6}\.\d{2}$/)
const periode = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/)

/** Un document repere dans un fichier : un PDF groupe peut en contenir trois. */
export const documentLu = z.strictObject({
  nature: z.enum(['bulletin_paie', 'pension', 'autre']),
  periode: z.union([periode, z.literal('')]),
  netPaye: z.union([montant, z.literal('')]),
})
export type DocumentLu = z.infer<typeof documentLu>

/** Forme demandee au modele. Les motifs sont verifies ensuite, pas par le fournisseur. */
export const schemaFournisseur = {
  type: 'object',
  additionalProperties: false,
  required: ['documents'],
  properties: {
    documents: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nature', 'periode', 'netPaye'],
        properties: {
          nature: { type: 'string', enum: ['bulletin_paie', 'pension', 'autre'] },
          periode: { type: 'string' },
          netPaye: { type: 'string' },
        },
      },
    },
  },
} as const

const brut = z.strictObject({
  documents: z
    .array(
      z.strictObject({
        nature: z.enum(['bulletin_paie', 'pension', 'autre']),
        periode: z.string().max(20),
        netPaye: z.string().max(20),
      }),
    )
    .max(6),
})

/**
 * Structure stricte, valeurs tolerees : un mois ou un montant mal forme est
 * vide, pas devine. « 2 345,67 » devient 2345.67 ; « 2.345,67 » reste vide.
 */
export function normaliserLecture(valeur: unknown): DocumentLu[] {
  return brut.parse(valeur).documents.map((d) => {
    const net = d.netPaye.replace(/[\s\u00a0\u202f€]/g, '').replace(/,(\d{2})$/, '.$1')
    return documentLu.parse({
      nature: d.nature,
      periode: periode.safeParse(d.periode.trim()).success ? d.periode.trim() : '',
      netPaye: montant.safeParse(net).success ? net : '',
    })
  })
}

export type Proposition = {
  /** Somme proposee, en centimes, ou null si rien n'est exploitable. */
  revenuCents: number | null
  salaire: { moyenneCents: number; periodes: string[]; variable: boolean } | null
  pension: { montantCents: number; periode: string } | null
  /** Periodes lues deux fois avec des montants differents, ecartees. */
  contradictoires: string[]
}

const enCents = (valeur: string) => Math.round(Number(valeur) * 100)
const MAX_CENTS = 100_000_000

/**
 * La proposition, deterministe et sans IA : moyenne des trois derniers mois de
 * salaire nets payes, plus la derniere pension. Une periode lue deux fois avec
 * deux montants n'est pas tranchee : elle est ecartee et signalee.
 */
export function proposerRevenu(documents: DocumentLu[]): Proposition {
  const parPeriode = (nature: DocumentLu['nature']) => {
    const vus = new Map<string, Set<number>>()
    for (const d of documents) {
      if (d.nature !== nature || !d.periode || !d.netPaye) continue
      const cents = enCents(d.netPaye)
      if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) continue
      vus.set(d.periode, (vus.get(d.periode) ?? new Set()).add(cents))
    }
    const contradictoires = [...vus].filter(([, m]) => m.size > 1).map(([p]) => p)
    const retenus = [...vus]
      .filter(([, m]) => m.size === 1)
      .map(([p, m]) => ({ periode: p, cents: [...m][0]! }))
      .sort((a, b) => b.periode.localeCompare(a.periode))
    return { retenus, contradictoires }
  }

  const bulletins = parPeriode('bulletin_paie')
  const pensions = parPeriode('pension')
  const derniers = bulletins.retenus.slice(0, 3)
  const salaire = derniers.length
    ? {
        moyenneCents: Math.round(derniers.reduce((n, b) => n + b.cents, 0) / derniers.length),
        periodes: derniers.map((b) => b.periode).sort(),
        variable:
          Math.max(...derniers.map((b) => b.cents)) >
          1.2 * Math.min(...derniers.map((b) => b.cents)),
      }
    : null
  const derniere = pensions.retenus[0]
  const pension = derniere ? { montantCents: derniere.cents, periode: derniere.periode } : null
  const total = (salaire?.moyenneCents ?? 0) + (pension?.montantCents ?? 0)
  return {
    revenuCents: total > 0 && total <= MAX_CENTS ? total : null,
    salaire,
    pension,
    contradictoires: [...bulletins.contradictoires, ...pensions.contradictoires].sort(),
  }
}

/** Restitution au navigateur : la proposition et ce qui a ete lu, rien d'autre. */
export const restitution = z.strictObject({
  proposition: z.strictObject({
    revenuCents: z.number().int().positive().max(MAX_CENTS).nullable(),
    salaire: z
      .strictObject({
        moyenneCents: z.number().int().positive().max(MAX_CENTS),
        periodes: z.array(periode).min(1).max(3),
        variable: z.boolean(),
      })
      .nullable(),
    pension: z
      .strictObject({ montantCents: z.number().int().positive().max(MAX_CENTS), periode })
      .nullable(),
    contradictoires: z.array(periode).max(24),
  }),
  illisibles: z.number().int().min(0).max(PIECES_MAX),
  modele: z
    .string()
    .max(150)
    .regex(/^[a-z0-9.-]+\/[a-z0-9._-]+$/),
})
export type Restitution = z.infer<typeof restitution>

/** « 2 345,67 » : ce que le champ revenu accepte deja. */
export function centsEnSaisie(cents: number): string {
  const euros = Math.floor(cents / 100)
  const reste = cents % 100
  return reste ? `${euros},${String(reste).padStart(2, '0')}` : String(euros)
}
