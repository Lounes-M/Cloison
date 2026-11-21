import { ExportRegistre } from '@/components/agences/ExportRegistre'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { EtatVide } from '@/components/ui/EtatVide'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { contexteAgence } from '@/lib/agences/contexte'
import { payerActe } from '@/lib/paiement/action-acte'
import { facturation as tFr } from '@/lib/content/facturation'
import { facturation as tEn } from '@/lib/content/en/facturation'
import { choisir, locale } from '@/lib/i18n'
import { langueEspace, titreEspace } from '@/lib/langue-espace'
export const generateMetadata = () => titreEspace(tFr.titre, tEn.titre)
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
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)

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
      {c.agence.statut === 'verifiee' ? <ExportRegistre registre="reglements" /> : null}
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
              <dl className="grid grid-cols-2 items-start gap-5 sm:grid-cols-[1fr_1fr_1.4fr]">
                <div>
                  <dt className="text-muted text-xs font-semibold">{t.montant}</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums">
                    {(f.montant_cents / 100).toLocaleString(locale(langue), {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-xs font-semibold">{t.date}</dt>
                  <dd className="mt-2 text-sm font-semibold">
                    <time dateTime={f.cree_le}>
                      {new Date(f.cree_le).toLocaleDateString(locale(langue))}
                    </time>
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1 sm:justify-self-end">
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
                  <button className="btn btn-principal">{t.payer}</button>
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
