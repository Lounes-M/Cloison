import { EnteteEspace } from '@/components/ui/EnteteEspace'
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
      <EnteteEspace titre={t.archives} etiquette={t.etiquette} />
      <p className="mt-4">{t.conserve}</p>
      <ul className="mt-6 grid gap-4">
        {liste.map((a) => (
          <li className="panneau-espace p-5" key={a.id}>
            <Link className="lien-espace" href={`/espace/actes/${a.id}`}>
              {a.modele} · {new Date(a.archive_le).toLocaleDateString('fr-FR')}
            </Link>
            {a.environnement === 'sandbox' ? <p>{t.sandbox}</p> : null}
            <p>
              {t.echeance} {new Date(a.conserver_jusqu_au).toLocaleDateString('fr-FR')}
            </p>
          </li>
        ))}
      </ul>
      {!liste.length ? <p className="mt-6">{t.aucun}</p> : null}
      {liste.length === 20 ? (
        <Link
          className="lien-espace mt-6 block"
          href={`/espace/archives?avant=${liste.at(-1)!.id}`}
        >
          {t.suite}
        </Link>
      ) : null}
      <Link className="lien-espace mt-6 block" href="/espace">
        {t.retour}
      </Link>
    </div>
  )
}
