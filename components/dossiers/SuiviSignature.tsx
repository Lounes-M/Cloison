import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { signature as tFr } from '@/lib/content/signature'
import { signature as tEn } from '@/lib/content/en/signature'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'
export async function SuiviSignature({
  db,
  dossier,
  partie,
}: {
  db: SupabaseClient
  dossier: string
  partie: 'agence' | 'garant'
}) {
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)

  if (process.env.SIGNATURE_PARCOURS_ENABLED !== 'true') return null
  const r = await db.rpc('actes_du_dossier', { le_dossier: dossier })
  const liste = z
    .array(
      z.object({
        id: z.uuid(),
        etape: z.string(),
        modele: z.string(),
        environnement: z.enum(['sandbox', 'production']),
        etat: z.string(),
      }),
    )
    .max(10)
    .safeParse(r.data)
  return (
    <section id="signature" className="panneau-espace mt-8">
      <h2 className="text-xl font-bold">{t.titre}</h2>
      {r.error || !liste.success ? (
        <p>{t.erreur}</p>
      ) : liste.data.length === 0 ? (
        <p className="text-muted mt-3 text-[15px] leading-relaxed font-medium">
          {partie === 'agence' ? t.aucunAgence : t.aucunGarant}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {liste.data.map((a) => (
            <li key={a.id}>
              <Link
                className="lien-espace"
                href={partie === 'agence' ? `/espace/actes/${a.id}` : `/garant/actes/${a.id}`}
              >
                {t.etapes[a.etape] ?? a.etape} · {a.modele}
              </Link>
              {a.environnement === 'sandbox' ? (
                <p className="text-muted text-sm">{t.sandbox}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {partie === 'agence' ? (
        <Link
          className="lien-espace mt-4 inline-block"
          href={`/espace/dossiers/${dossier}/signature`}
        >
          {t.preparation}
        </Link>
      ) : null}
    </section>
  )
}
