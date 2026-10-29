import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { contexteAgence } from '@/lib/agences/contexte'
import { configurationParcours } from '@/lib/signature/configuration-parcours'
import { ModeleActe } from '@/components/forms/ModeleActe'
import { acte as t } from '@/lib/content/acte'
import { dateLongue, euros } from '@/lib/acte/modele-cautionnement'

export const metadata = { title: 'Acte de cautionnement', robots: { index: false, follow: false } }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')
  if (c.agence.statut !== 'verifiee') notFound()

  const [{ data: d, error }, { data: e }] = await Promise.all([
    c.supabase
      .from('dossiers')
      .select('id,statut,demonstration,loyer_cents,locataire_nom')
      .eq('id', id)
      .maybeSingle(),
    c.supabase
      .from('engagements')
      .select('solidaire,montant_max_cents,jusqu_au,mention')
      .eq('dossier_id', id)
      .maybeSingle(),
  ])
  if (error || !d || d.statut !== 'transmis' || d.demonstration) notFound()

  const aujourdHui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(
    new Date(),
  )

  return (
    <div className="page-espace w-full max-w-[880px]">
      <EnteteEspace titre={t.titre} etiquette={t.etiquette} />
      <p className="my-6">{t.explication}</p>
      <p className="mb-6 font-bold">{t.mention}</p>

      <section className="panneau-espace mb-8">
        <h2 className="font-display text-xl uppercase">{t.conditions}</h2>
        {e ? (
          <dl className="mt-3 grid gap-1">
            <div>
              <dt className="inline font-bold">{e.solidaire ? t.solidaire : t.simple}</dt>
            </div>
            {e.montant_max_cents ? (
              <div>
                <dt className="inline">{t.plafond} : </dt>
                <dd className="inline">{euros(Number(e.montant_max_cents))}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline">{t.duree} : </dt>
              <dd className="inline">
                {e.jusqu_au ? `${t.jusquAu} ${dateLongue(String(e.jusqu_au))}` : t.indeterminee}
              </dd>
            </div>
            {d.loyer_cents ? (
              <div>
                <dt className="inline">{t.rappelLoyer} </dt>
                <dd className="inline">{euros(Number(d.loyer_cents))}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {!e?.mention ? <p className="mt-3 font-bold">{t.sansMention}</p> : null}
      </section>

      <p className="text-muted mb-6">{t.relecture}</p>
      <ModeleActe
        dossier={id}
        locataire={d.locataire_nom ? String(d.locataire_nom) : ''}
        aujourdHui={aujourdHui}
        signatureOuverte={configurationParcours() !== null}
      />
    </div>
  )
}
