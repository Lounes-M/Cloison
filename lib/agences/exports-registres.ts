import { z } from 'zod'
import { exportsRegistres as t } from '@/lib/content/exports-registres'
import { facturation } from '@/lib/content/facturation'

export type Registre = 'archives' | 'reglements'
export const LIMITE_REGISTRE = 1000
export const TAILLE_EXPORT_MAX = 2 * 1024 * 1024
const date = z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString())
const texte = z.string().min(1).max(500)
const cents = z.number().int().min(0).max(2147483647)
const archive = z.object({
  id: z.uuid(),
  modele: texte,
  archive_le: date,
  conserver_jusqu_au: date,
  environnement: z.enum(['sandbox', 'production']),
})
const reglement = z
  .object({
    id: z.uuid(),
    montant_cents: cents,
    rembourse_cents: cents.nullable(),
    cree_le: date,
    paye_le: date.nullable(),
    tarif_version: texte,
    etat: z.enum(['a_regler', 'reserve', 'ouvert', 'paye', 'rembourse', 'litige']),
    anomalie: z.boolean().nullable(),
  })
  .refine((v) => (v.rembourse_cents ?? 0) <= v.montant_cents)

export class RegistreTropGrand extends Error {}

// Les contrôles sont normalisés ; les préfixes de formule deviennent du texte explicite.
export function celluleCSV(valeur: string): string {
  let contenu = valeur.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim()
  if (/^[=+\-@＝＋－＠]/u.test(contenu)) contenu = t.texte + contenu
  return '"' + contenu.replaceAll('"', '""') + '"'
}
function euros(valeur: number): string {
  return `${Math.floor(valeur / 100)},${String(valeur % 100).padStart(2, '0')}`
}

export async function exporterRegistre(
  registre: Registre,
  lire: (avant: string | null) => Promise<unknown>,
  signal: AbortSignal,
  maintenant = new Date(),
): Promise<string> {
  const generation = maintenant.toISOString()
  const lignes: string[][] = []
  const ids = new Set<string>()
  let avant: string | null = null
  for (;;) {
    signal.throwIfAborted()
    const donnees = await lire(avant)
    signal.throwIfAborted()
    const page =
      registre === 'archives'
        ? z.array(archive).max(20).parse(donnees)
        : z.array(reglement).max(20).parse(donnees)
    for (const ligne of page) {
      if (ids.has(ligne.id)) throw new Error('Pagination incohérente')
      ids.add(ligne.id)
      if (ids.size > LIMITE_REGISTRE) throw new RegistreTropGrand()
      if ('modele' in ligne) {
        lignes.push([
          ligne.id,
          ligne.modele,
          ligne.archive_le,
          ligne.conserver_jusqu_au,
          ligne.environnement,
          generation,
        ])
      } else {
        lignes.push([
          ligne.id,
          euros(ligne.montant_cents),
          ligne.rembourse_cents === null ? '' : euros(ligne.rembourse_cents),
          ligne.cree_le,
          ligne.paye_le ?? '',
          ligne.tarif_version,
          facturation.etats[ligne.etat] ?? ligne.etat,
          ligne.anomalie ? t.oui : t.non,
          generation,
        ])
      }
    }
    if (page.length < 20) break
    avant = page.at(-1)!.id
  }
  const entete = registre === 'archives' ? t.colonnesArchives : t.colonnesReglements
  const csv =
    '\ufeff' +
    [entete, ...lignes].map((ligne) => ligne.map(celluleCSV).join(';')).join('\r\n') +
    '\r\n'
  if (new TextEncoder().encode(csv).byteLength > TAILLE_EXPORT_MAX) throw new RegistreTropGrand()
  return csv
}
