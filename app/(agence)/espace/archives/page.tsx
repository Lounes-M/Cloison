import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { EtatVide } from '@/components/ui/EtatVide'
import { Icone } from '@/components/ui/Icone'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { contexteAgence } from '@/lib/agences/contexte'
import { signature as t } from '@/lib/content/signature'
export const metadata = { title: t.archives, robots: { index: false, follow: false } }
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ avant?: string }>
}) {
  const q = await searchParams,
    c = await contexteAgence()
  if (c.etat !== 'rattache') notFound()
  const avant = q.avant ? z.uuid().safeParse(q.avant) : null
  if (avant && !avant.success) notFound()
  const r = await c.supabase.rpc('archives_de_mon_agence', { avant: avant?.data ?? null })
  if (r.error) throw new Error('Archives indisponibles')
  const liste = z
    .array(
      z.object({
        id: z.uuid(),
        modele: z.string(),
        archive_le: z.string(),
        conserver_jusqu_au: z.string(),
        environnement: z.enum(['sandbox', 'production']),
      }),
    )
    .max(20)
    .parse(r.data)
  return (
    <div className="page-espace w-full max-w-[880px]">
      <Link className="lien-espace mb-6" href="/espace">
        {t.retour}
      </Link>
      <EnteteEspace titre={t.archives} etiquette={t.etiquette}>
        <p>{t.conserve}</p>
      </EnteteEspace>
      {liste.length ? (
        <ul className="grid gap-4">
          {liste.map((a) => (
            <li className="panneau-espace" key={a.id}>
              <div className="flex items-start gap-4">
                <span className="bg-sky/20 text-cobalt grid size-11 shrink-0 place-items-center rounded-xl">
                  <Icone nom="acte" className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    className="text-cobalt inline-flex min-h-11 items-center font-bold break-words underline-offset-4 hover:underline"
                    href={`/espace/actes/${a.id}`}
                  >
                    {a.modele} · {new Date(a.archive_le).toLocaleDateString('fr-FR')}
                  </Link>
                  <p className="text-muted mt-2 text-sm leading-relaxed">
                    {t.echeance} {new Date(a.conserver_jusqu_au).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
              {a.environnement === 'sandbox' ? (
                <p className="bg-sun/20 mt-4 rounded-lg px-3 py-2 text-xs leading-relaxed font-semibold">
                  {t.sandbox}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EtatVide titre={t.aucun} icone="acte">
          <p>{t.archivesAide}</p>
        </EtatVide>
      )}
      {liste.length === 20 ? (
        <Link className="lien-espace mt-6" href={`/espace/archives?avant=${liste.at(-1)!.id}`}>
          {t.suite}
        </Link>
      ) : null}
    </div>
  )
}
