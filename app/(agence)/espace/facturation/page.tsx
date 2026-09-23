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
      <h1 className="font-display text-3xl uppercase">{t.titre}</h1>
      <p className="mt-4">{t.explication}</p>
      {q.paiement === 'indisponible' ? (
        <p role="status" className="mt-4">
          {t.indisponible}
        </p>
      ) : null}
      {!actif ? <p className="mt-4">{t.suspendu}</p> : null}
      <ul className="mt-6 grid gap-5">
        {liste.map((f) => (
          <li className="panneau-espace p-5" key={f.id}>
            <p>
              {new Date(f.cree_le).toLocaleDateString('fr-FR')} ·{' '}
              {(f.montant_cents / 100).toLocaleString('fr-FR', {
                style: 'currency',
                currency: 'EUR',
              })}
            </p>
            <p>{f.anomalie ? t.anomalie : (t.etats[f.etat] ?? f.etat)}</p>
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
      {!liste.length ? <p className="mt-6">{t.aucun}</p> : null}
      {liste.length === 20 ? (
        <Link
          className="lien-espace mt-6 block"
          href={`/espace/facturation?avant=${liste.at(-1)!.id}`}
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
