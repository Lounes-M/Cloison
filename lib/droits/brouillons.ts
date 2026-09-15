import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  collecterDonneesDroits,
  decisionCollecte,
  verifierSuiviCollecte,
  type BaseCollecte,
} from './collecte.ts'
import { ouvrirAvecTrousseau, type Trousseau } from '../coffre/rotation-format.ts'
import { dechiffrerBrouillon } from '../brouillons/format.ts'

const ligne = z.strictObject({
  dossier_id: z.uuid(),
  revision: z.uuid(),
  version_conditions: z.number().int().nonnegative(),
  chiffre: z
    .string()
    .regex(/^(?:[a-f0-9]{2}){29,4096}$/)
    .nullable(),
  cle: z
    .string()
    .regex(/^(?:[a-f0-9]{2}){60,128}$/)
    .nullable(),
  expire_le: z.string(),
})
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const refuser = (): never => {
  throw new Error('Collecte des brouillons refusee.')
}

async function selection(db: BaseCollecte, brut: string) {
  const { decision: d } = decisionCollecte(brut)
  if (!d.brouillons?.length) return refuser()
  await verifierSuiviCollecte(db, brut)
  const { rows } = await db.query(
    `with selection as (
    select * from unnest($1::uuid[],$2::uuid[]) with ordinality as s(dossier,revision,ordre)
  ) select b.dossier_id,b.revision,b.version_conditions,encode(b.chiffre,'hex') chiffre,
    encode(c.cle_scellee,'hex') cle,b.expire_le::text
  from selection s join public.brouillons_engagement b on b.dossier_id=s.dossier and b.revision=s.revision
  join public.dossiers d on d.id=b.dossier_id
  left join public.cles_dossier c on c.dossier_id=b.dossier_id
  where lower(d.email_garant)=lower($3) and d.coffre_purge_le is null
  and b.expire_le>clock_timestamp() and d.expire_le>clock_timestamp()
  and b.version_conditions=coalesce((select e.version_conditions from public.engagements e where e.dossier_id=d.id),0)
  order by s.ordre`,
    [d.brouillons.map((b) => b.dossier), d.brouillons.map((b) => b.revision), d.destinataire.email],
  )
  if (rows.length !== d.brouillons.length) return refuser()
  const resultat = rows.map((r, i) => {
    const b = ligne.parse(r),
      attendu = d.brouillons![i]!
    if (
      b.dossier_id !== attendu.dossier ||
      b.revision !== attendu.revision ||
      !Number.isFinite(Date.parse(b.expire_le))
    )
      return refuser()
    return { ...b, expire_le: new Date(b.expire_le).toISOString() }
  })
  await verifierSuiviCollecte(db, brut)
  return resultat
}

/** Collecte de travail : une saisie non validee ne devient jamais un engagement. */
export async function collecterBrouillonsDroits(
  db: BaseCollecte,
  brut: string,
  trousseau: Trousseau,
) {
  try {
    const lignes = await selection(db, brut),
      empreinte = hash(lignes)
    const verifier = async () => {
      try {
        if (hash(await selection(db, brut)) !== empreinte) refuser()
      } catch {
        refuser()
      }
    }
    const brouillons = lignes.map((b) => {
      let cle: Buffer | undefined
      let saisie = null
      try {
        if (b.chiffre !== null) {
          if (!b.cle) return refuser()
          cle = ouvrirAvecTrousseau(Buffer.from(b.cle, 'hex'), trousseau)
          saisie = dechiffrerBrouillon(
            Buffer.from(b.chiffre, 'hex'),
            b.dossier_id,
            b.version_conditions,
            cle,
          )
        }
        return {
          dossier: b.dossier_id,
          revision: b.revision,
          versionConditions: b.version_conditions,
          expireLe: b.expire_le,
          nature: 'saisie_non_validee',
          saisie,
        }
      } finally {
        cle?.fill(0)
      }
    })
    await verifier()
    return { brouillons, verifier }
  } catch {
    return refuser()
  }
}

export async function collecterCopiePersonnelle(
  db: BaseCollecte,
  brut: string,
  trousseau?: Trousseau,
) {
  const { decision } = decisionCollecte(brut)
  if (decision.brouillons && !trousseau) return refuser()
  const donnees = await collecterDonneesDroits(db, brut)
  const complement = decision.brouillons
    ? await collecterBrouillonsDroits(db, brut, trousseau!)
    : null
  const verifier = async () => {
    await verifierSuiviCollecte(db, brut)
    await complement?.verifier()
  }
  await verifier()
  return {
    verifier,
    donnees: complement
      ? {
          ...donnees,
          brouillons: complement.brouillons,
          sourcesNonCouvertes: donnees.sourcesNonCouvertes.map((s) =>
            s === 'brouillons_chiffres' ? 'brouillons_non_selectionnes' : s,
          ),
        }
      : donnees,
  }
}
