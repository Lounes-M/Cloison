import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { EtatVide } from '@/components/ui/EtatVide'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { contexteAgence } from '@/lib/agences/contexte'
import { payerActe } from '@/lib/paiement/action-acte'
import { facturation as t } from '@/lib/content/facturation'
export const metadata = { title: t.titre, robots: { index: false, follow: false } }
const lignes = z
  .array(
    z.object({
      id: z.uuid(),
      montant_cents: z.number().int().positive(),
      cree_le: z.string(),
      paye_le: z.string().nullable(),
      tarif_version: z.string(),
      etat: z.string(),
      anomalie: z.boolean().nullable(),
    }),
  )
  .max(20)
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ avant?: string; paiement?: string }>
}) {
  const q = await searchParams
  const c = await contexteAgence()
  if (c.etat !== 'rattache') notFound()
  const avant = q.avant ? z.uuid().safeParse(q.avant) : null
  if (avant && !avant.success) notFound()
  const r = await c.supabase.rpc('factures_de_mon_agence', { avant: avant?.data ?? null })
  if (r.error) throw new Error('Facturation indisponible')
  const liste = lignes.parse(r.data),
    actif = process.env.FACTURATION_ACTES_ENABLED === 'true'
  return (
    <div className="page-espace w-full max-w-[880px]">
      <Link className="lien-espace mb-6" href="/espace">
        {t.retour}
      </Link>
      <EnteteEspace titre={t.titre} etiquette={t.etiquette}>
        <p>{t.explication}</p>
      </EnteteEspace>
      {q.paiement === 'indisponible' ? (
        <p
          role="status"
          className="border-sun bg-sun/15 mb-5 rounded-r-xl border-l-4 px-4 py-3 text-sm leading-relaxed"
        >
          {t.indisponible}
        </p>
      ) : null}
      {!actif ? (
        <p className="border-sky bg-sky/15 mb-5 rounded-r-xl border-l-4 px-4 py-3 text-sm leading-relaxed">
          {t.suspendu}
        </p>
      ) : null}
      {liste.length ? (
        <ul className="grid gap-4">
          {liste.map((f) => (
            <li className="panneau-espace" key={f.id}>
              <dl className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <dt className="text-muted text-xs font-semibold">{t.montant}</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums">
                    {(f.montant_cents / 100).toLocaleString('fr-FR', {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-xs font-semibold">{t.date}</dt>
                  <dd className="mt-2 text-sm font-semibold">
                    <time dateTime={f.cree_le}>
                      {new Date(f.cree_le).toLocaleDateString('fr-FR')}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">{t.etat}</dt>
                  <dd
                    className={`inline-block rounded-lg px-3 py-2 text-sm font-semibold ${f.anomalie ? 'bg-sun/30' : 'bg-sky/20'}`}
                  >
                    {f.anomalie ? t.anomalie : (t.etats[f.etat] ?? f.etat)}
                  </dd>
                </div>
              </dl>
              {!f.paye_le && !f.anomalie && actif ? (
                <form action={payerActe} className="mt-4">
                  <input type="hidden" name="facture" value={f.id} />
                  <input type="hidden" name="montant" value={f.montant_cents} />
                  <input type="hidden" name="tarif" value={f.tarif_version} />
                  <button className="press outlined bg-cobalt rounded-brut px-5 py-3 font-bold text-white">
                    {t.payer}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EtatVide titre={t.aucun} icone="acte">
          <p>{t.aucunAide}</p>
        </EtatVide>
      )}
      {liste.length === 20 ? (
        <Link className="lien-espace mt-6" href={`/espace/facturation?avant=${liste.at(-1)!.id}`}>
          {t.suite}
        </Link>
      ) : null}
    </div>
  )
}
