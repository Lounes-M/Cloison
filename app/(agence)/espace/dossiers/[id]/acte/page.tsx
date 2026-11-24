import { colocation as texteColocationFr } from '@/lib/content/colocation'
import { colocation as texteColocationEn } from '@/lib/content/en/colocation'
import Link from 'next/link'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { contexteAgence } from '@/lib/agences/contexte'
import { configurationParcours } from '@/lib/signature/configuration-parcours'
import { ModeleActe } from '@/components/forms/ModeleActe'
import { acte as tFr } from '@/lib/content/acte'
import { dateLongue, euros } from '@/lib/acte/modele-cautionnement'
import { acte as tEn } from '@/lib/content/en/acte'
import { choisir, deuxPoints } from '@/lib/i18n'
import { langueEspace, titreEspace } from '@/lib/langue-espace'
import { titres as titresEn } from '@/lib/content/en/titres'
import { titres as titresFr } from '@/lib/content/titres'

export const generateMetadata = () => titreEspace(titresFr.acte, titresEn.acte)

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)

  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')
  if (c.agence.statut !== 'verifiee') notFound()

  const [{ data: d, error }, { data: e }] = await Promise.all([
    c.supabase
      .from('dossiers')
      .select(
        'id,statut,demonstration,loyer_cents,locataire_nom,colocation_id,colocataires_garantis,dossier_principal',
      )
      .eq('id', id)
      .maybeSingle(),
    c.supabase
      .from('engagements')
      .select('solidaire,montant_max_cents,jusqu_au,mention')
      .eq('dossier_id', id)
      .maybeSingle(),
  ])
  if (error || !d || d.statut !== 'transmis' || d.demonstration) notFound()

  // Garant commun (0094) : le second garant couvre les memes colocataires que
  // le premier, et son dossier lit le nombre sur le principal.
  let garantis = Number(d.colocataires_garantis) || 1
  let enColocation = Boolean(d.colocation_id)
  if (d.dossier_principal) {
    const { data: p } = await c.supabase
      .from('dossiers')
      .select('colocation_id,colocataires_garantis')
      .eq('id', d.dossier_principal)
      .maybeSingle()
    garantis = Number(p?.colocataires_garantis) || 1
    enColocation = Boolean(p?.colocation_id)
  }
  const texteColocation = choisir(langue, texteColocationFr, texteColocationEn)

  const aujourdHui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(
    new Date(),
  )

  return (
    <div className="page-espace w-full max-w-[880px]">
      <Link href={`/espace/dossiers/${id}`} className="lien-retour">
        {t.retourDossier}
      </Link>
      <EnteteEspace titre={t.titre} etiquette={t.etiquette} />
      <p className="my-6">{t.explication}</p>
      <p className="mb-6 font-bold">{t.mention}</p>

      <section className="panneau-espace mb-8">
        <h2 className="text-xl font-bold">{t.conditions}</h2>
        {e ? (
          <dl className="mt-3 grid gap-1">
            <div>
              <dt className="inline font-bold">{e.solidaire ? t.solidaire : t.simple}</dt>
            </div>
            {e.montant_max_cents ? (
              <div>
                <dt className="inline">
                  {t.plafond}
                  {deuxPoints(langue)}
                </dt>
                <dd className="inline">{euros(Number(e.montant_max_cents))}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline">
                {t.duree}
                {deuxPoints(langue)}
              </dt>
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

      {enColocation ? (
        <p className="outlined bg-paper mb-6 rounded-xl p-4 text-[14px] font-medium">
          {texteColocation.acte}
          {garantis > 1 ? ` ${texteColocation.acteCommun(garantis)}` : ''}
        </p>
      ) : null}
      <p className="text-muted mb-6">{t.relecture}</p>
      <section className="panneau-espace">
        <ModeleActe
          dossier={id}
          locataire={d.locataire_nom ? String(d.locataire_nom) : ''}
          aujourdHui={aujourdHui}
          signatureOuverte={configurationParcours() !== null}
          autresGarantis={enColocation ? garantis - 1 : 0}
        />
      </section>
    </div>
  )
}
