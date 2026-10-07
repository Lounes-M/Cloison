import { z } from 'zod'
import type { BaseCollecte } from './collecte.ts'

const instant = z.iso.datetime().nullable()
const compte = z.strictObject({
  id: z.uuid(),
  email: z.email().max(180),
  telephone: z.string().max(64).nullable(),
  emailConfirmeLe: instant,
  telephoneConfirmeLe: instant,
  creeLe: instant,
  modifieLe: instant,
  derniereConnexionLe: instant,
  supprimeLe: instant,
  rattachement: z
    .strictObject({
      id: z.uuid(),
      agence: z.uuid(),
      role: z.enum(['admin', 'membre']),
      creeLe: z.iso.datetime(),
    })
    .nullable(),
})

/** Liste fermee de champs : jamais de metadonnees libres, secret ou session Auth. */
export async function collecterComptesDroits(
  db: BaseCollecte,
  ids: string[],
  email: string,
  nature: 'acces' | 'portabilite',
) {
  const { rows } = await db.query(
    `with comptes_selectionnes as (
      select * from unnest($1::uuid[]) with ordinality as s(id,ordre)
    ) select u.id,u.email,u.phone telephone,
      u.email_confirmed_at::text email_confirme_le,u.phone_confirmed_at::text telephone_confirme_le,
      u.created_at::text cree_le,u.updated_at::text modifie_le,
      u.last_sign_in_at::text derniere_connexion_le,u.deleted_at::text supprime_le,
      case when m.id is not null then jsonb_build_object(
        'id',m.id,'agence',m.agence_id,'role',m.role,'creeLe',m.cree_le
      ) else null end rattachement
    from comptes_selectionnes s join auth.users u on u.id=s.id
    left join public.membres_agence m on m.utilisateur_id=u.id
    where lower(u.email)=lower($2) order by s.ordre`,
    [ids, email],
  )
  if (rows.length !== ids.length) throw new Error('Collecte des comptes refusee.')
  const date = (v: unknown) => (v === null ? null : new Date(String(v)).toISOString())
  return rows.map((r, i) => {
    const rattachement = r.rattachement as Record<string, unknown> | null
    const c = compte.parse({
      id: r.id,
      email: r.email,
      telephone: r.telephone,
      emailConfirmeLe: date(r.email_confirme_le),
      telephoneConfirmeLe: date(r.telephone_confirme_le),
      creeLe: date(r.cree_le),
      modifieLe: date(r.modifie_le),
      derniereConnexionLe: date(r.derniere_connexion_le),
      supprimeLe: date(r.supprime_le),
      rattachement: rattachement ? { ...rattachement, creeLe: date(rattachement.creeLe) } : null,
    })
    if (c.id !== ids[i] || c.email.toLowerCase() !== email.toLowerCase())
      throw new Error('Collecte des comptes refusee.')
    // Les donnees observees et le role attribue restent soumis a revue pour la portabilite.
    return nature === 'acces'
      ? c
      : {
          ...c,
          emailConfirmeLe: null,
          telephoneConfirmeLe: null,
          creeLe: null,
          modifieLe: null,
          derniereConnexionLe: null,
          supprimeLe: null,
          rattachement: null,
        }
  })
}
