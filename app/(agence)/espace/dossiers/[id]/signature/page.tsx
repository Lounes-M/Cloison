import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { notFound, redirect } from 'next/navigation'

import { z } from 'zod'

import { contexteAgence } from '@/lib/agences/contexte'

import { configurationParcours } from '@/lib/signature/configuration-parcours'

import { FormulaireActe } from '@/components/forms/FormulaireActe'

import { signature as t } from '@/lib/content/signature'

export const metadata = { title: 'Préparer la signature', robots: { index: false, follow: false } }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!z.uuid().safeParse(id).success) notFound()

  const c = await contexteAgence()

  if (c.etat !== 'rattache') redirect('/connexion')

  const config = configurationParcours()

  if (!config || c.agence.statut !== 'verifiee') notFound()

  const { data: d, error } = await c.supabase
    .from('dossiers')
    .select('id,statut,demonstration')
    .eq('id', id)
    .maybeSingle()

  if (error || !d || d.statut !== 'transmis' || d.demonstration) notFound()

  return (
    <div className="page-espace w-full max-w-[880px]">
      <EnteteEspace titre={t.preparation} etiquette={t.etiquette} />
      <p className="my-6">{t.explication}</p>
      <p className="mb-6">
        {t.modele} : {config.modele}
      </p>
      {config.mode === 'sandbox' ? <p className="mb-6 font-bold">{t.sandbox}</p> : null}
      <FormulaireActe dossier={id} />
    </div>
  )
}
