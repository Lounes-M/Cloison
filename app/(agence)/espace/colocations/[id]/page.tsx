import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { FormulaireColocation } from '@/components/forms/FormulaireColocation'
import {
  FormulaireGarantCommun,
  FormulaireSolvabilite,
} from '@/components/forms/ReglagesColocation'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { Repere } from '@/components/ui/Repere'
import { contexteAgence } from '@/lib/agences/contexte'
import { colocation as tFr } from '@/lib/content/colocation'
import { colocation as tEn } from '@/lib/content/en/colocation'
import { statuts as statutsEn } from '@/lib/content/en/espace'
import { euros as eurosEn } from '@/lib/content/en/tarifs'
import { statuts as statutsFr } from '@/lib/content/espace'
import { euros as eurosFr } from '@/lib/content/tarifs'
import { choisir, locale } from '@/lib/i18n'
import { langueEspace, titreEspace } from '@/lib/langue-espace'
import { cn } from '@/lib/utils'
import { estUuidCanonique } from '@/lib/validation/uuid'

export const generateMetadata = () => titreEspace(tFr.titre, tEn.titre)

type Membre = {
  id: string
  reference: string
  statut: string
  email_locataire: string
  loyer_cents: number | string | null
  expire_le: string
  colocataires_garantis: number | string | null
  engagements: Engagement | Engagement[] | null
}
type Engagement = { ratio: string | null; mention_saisie_le: string | null }

const EN_COURS = ['ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant', 'transmis', 'signe']

/**
 * Une colocation : ses dossiers, un par colocataire, lus avec les droits de
 * l'agence. La page ne montre rien que la fiche de chaque dossier ne montre
 * deja ; elle les reunit, et dit si les parts font bien le loyer du bail.
 * L'agence y regle aussi la solvabilite commune et le garant commun (0094).
 */
export default async function PageColocation({ params }: { params: Promise<{ id: string }> }) {
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)
  const euros = choisir(langue, eurosFr, eurosEn)
  const statuts = choisir(langue, statutsFr, statutsEn)

  const { id } = await params
  if (!estUuidCanonique(id)) notFound()
  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')

  const [{ data: coloc, error: e1 }, { data: dossiers, error: e2 }] = await Promise.all([
    c.supabase
      .from('colocations')
      .select('id, loyer_total_cents, etendue, solvabilite, logement_id, logements(id, libelle)')
      .eq('id', id)
      .maybeSingle(),
    c.supabase
      .from('dossiers')
      .select(
        'id, reference, statut, email_locataire, loyer_cents, expire_le, colocataires_garantis, engagements(ratio, mention_saisie_le)',
      )
      .eq('colocation_id', id)
      .order('cree_le', { ascending: true })
      .limit(200),
  ])
  if (e1 || e2) throw new Error('Colocation indisponible')
  // La RLS a decide : la colocation d'une autre agence n'existe pas ici.
  if (!coloc) notFound()

  const tous = (dossiers ?? []) as Membre[]
  // Un dossier echu porte le statut `expire` des la purge ; d'ici la, il compte.
  const vivant = (d: Membre) => EN_COURS.includes(d.statut)
  const membres = tous.filter(vivant)
  const partis = tous.filter((d) => !vivant(d))
  const total = Number(coloc.loyer_total_cents)
  const etendue = coloc.etendue === 'loyer_entier' ? 'loyer_entier' : 'part'
  const commune = coloc.solvabilite === 'commune'
  const garantisDe = (d: Membre) => Number(d.colocataires_garantis) || 1
  const colocataires = membres.reduce((s, d) => s + garantisDe(d), 0)
  const pris = membres.some((d) => d.statut === 'transmis' || d.statut === 'signe')
  // Le ratio commun (0094) : une panne ne bloque pas la fiche, la ligne disparait.
  let ratioCommun: number | null = null
  if (commune) {
    const { data, error } = await c.supabase.rpc('solvabilite_commune', { la_colocation: id })
    if (error) console.error('[agence] solvabilite commune illisible')
    else if (data != null && Number.isFinite(Number(data))) ratioCommun = Number(data)
  }
  const logement = (Array.isArray(coloc.logements) ? coloc.logements[0] : coloc.logements) as
    { id: string; libelle: string } | null | undefined

  const complets = membres.filter((d) => ['complet', 'transmis', 'signe'].includes(d.statut)).length
  const signee = membres.some((d) => d.statut === 'signe')
  const somme = membres.reduce((s, d) => s + Number(d.loyer_cents ?? 0), 0)
  const sansPart = membres.some((d) => d.loyer_cents == null)
  const seuil = c.agence.seuilRatio
  const fmt = (n: number) => n.toLocaleString(locale(langue), { minimumFractionDigits: 2 })
  const engagementDe = (d: Membre) =>
    Array.isArray(d.engagements) ? d.engagements[0] : d.engagements
  const ratioDe = (d: Membre) => {
    const e = engagementDe(d)
    return e?.ratio == null ? null : Number(e.ratio)
  }
  // Le garant commun ne se regle que sur un dossier pas encore pris, dont le
  // garant n'a pas saisi sa mention : la base refuse le reste.
  const reglables = membres.filter(
    (d) =>
      ['ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant'].includes(d.statut) &&
      !engagementDe(d)?.mention_saisie_le,
  )

  const lignes = (liste: Membre[]) =>
    liste.map((d) => {
      const statut = statuts[d.statut] ?? statuts.ouvert!
      const ratio = ratioDe(d)
      return (
        <tr key={d.id} className="border-ink/10 border-b last:border-0">
          <th scope="row" className="py-2 pr-4 font-semibold break-all">
            {d.email_locataire}
            {garantisDe(d) > 1 ? (
              <span className="text-muted block text-[13px] font-medium break-normal">
                {t.tableau.garantis(garantisDe(d))}
              </span>
            ) : null}
          </th>
          <td className="py-2 pr-4">
            <Link
              href={`/espace/dossiers/${d.id}`}
              className="text-cobalt underline underline-offset-2"
            >
              {d.reference}
            </Link>
          </td>
          <td className="py-2 pr-4">
            <Repere ton={statut.ton} className="text-[13px]">
              {statut.libelle}
            </Repere>
          </td>
          <td className="py-2 pr-4 text-right tabular-nums">
            {d.loyer_cents == null ? t.tableau.sansLoyer : euros(Number(d.loyer_cents))}
          </td>
          <td
            className={cn(
              'py-2 pr-4 text-right tabular-nums',
              !commune && ratio != null && ratio >= seuil && 'font-bold',
            )}
          >
            {ratio == null ? t.tableau.attente : `${fmt(ratio)}×`}
          </td>
        </tr>
      )
    })

  const entete = (
    <thead>
      <tr className="border-ink/15 border-b">
        <th scope="col" className="py-2 pr-4 font-bold">
          {t.tableau.locataire}
        </th>
        <th scope="col" className="py-2 pr-4 font-bold">
          {t.tableau.reference}
        </th>
        <th scope="col" className="py-2 pr-4 font-bold">
          {t.tableau.statut}
        </th>
        <th scope="col" className="py-2 pr-4 text-right font-bold">
          {t.tableau.loyer}
        </th>
        <th scope="col" className="py-2 pr-4 text-right font-bold">
          {t.tableau.ratio}
        </th>
      </tr>
    </thead>
  )

  return (
    <div className="page-espace w-full max-w-[880px]">
      <Link href="/espace" className="lien-retour">
        {t.retour}
      </Link>
      <EnteteEspace titre={t.titre} etiquette={t.entete(total, colocataires)}>
        <p>{t.etendues[etendue]}</p>
        <p>{t.solvabilites[commune ? 'commune' : 'individuelle']}</p>
        {logement ? (
          <p>
            {t.logement} :{' '}
            <Link
              href={`/espace/logements/${logement.id}`}
              className="text-cobalt underline underline-offset-2"
            >
              {logement.libelle}
            </Link>
          </p>
        ) : null}
      </EnteteEspace>

      <div
        className={cn(
          'outlined rounded-xl p-4 text-[14px]',
          membres.length > 0 && complets === membres.length ? 'bg-mint' : 'bg-paper',
        )}
      >
        <p className="font-semibold">
          {membres.length === 0
            ? t.etat.vide
            : complets === membres.length
              ? t.etat.complete
              : t.etat.enCours(complets, membres.length)}
        </p>
        {commune && membres.length > 0 ? (
          <p className="mt-1">
            <span className={cn(ratioCommun != null && ratioCommun >= seuil && 'font-bold')}>
              {ratioCommun == null ? t.commune.attente : t.commune.ratio(fmt(ratioCommun))}
            </span>{' '}
            {t.commune.aide}
          </p>
        ) : null}
        <p className="text-muted mt-1 text-[13px] font-medium">{t.decision}</p>
      </div>

      {etendue === 'part' && membres.length > 0 && (sansPart || somme !== total) ? (
        <p role="status" className="outlined bg-sun mt-4 rounded-xl p-4 text-[14px] font-medium">
          {sansPart ? t.parts.incompletes : t.parts.ecart(somme, total)}
        </p>
      ) : null}

      <section
        className="panneau-espace ombres-defilement relative mt-8 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={t.tableau.titre}
      >
        <h2 className="text-xl font-bold">{t.tableau.titre}</h2>
        {membres.length === 0 ? (
          <p className="text-muted mt-3 text-[14px] font-medium">{t.etat.vide}</p>
        ) : (
          <table className="mt-4 w-full min-w-[640px] text-left text-[14px]">
            {entete}
            <tbody>{lignes(membres)}</tbody>
          </table>
        )}
        {partis.length > 0 ? (
          <>
            <h3 className="mt-8 text-[15px] font-bold">{t.tableau.partis}</h3>
            <table className="text-muted mt-3 w-full min-w-[640px] text-left text-[14px]">
              {entete}
              <tbody>{lignes(partis)}</tbody>
            </table>
          </>
        ) : null}
      </section>

      {!pris && membres.length > 0 ? (
        <section className="panneau-espace mt-8">
          <h2 className="text-xl font-bold">{t.reglages.solvabilite}</h2>
          <div className="mt-4">
            <FormulaireSolvabilite
              colocationId={id}
              actuelle={commune ? 'commune' : 'individuelle'}
              solidaire={etendue === 'loyer_entier'}
            />
          </div>
        </section>
      ) : null}

      {reglables.length > 0 ? (
        <section className="panneau-espace mt-8">
          <h2 className="text-xl font-bold">{t.reglages.garantTitre}</h2>
          <p className="text-muted mt-2 mb-5 text-[14px] font-medium">{t.reglages.garantAide}</p>
          <FormulaireGarantCommun
            colocationId={id}
            dossiers={reglables.map((d) => ({
              id: d.id,
              libelle: `${d.reference} · ${d.email_locataire}`,
              garantis: garantisDe(d),
            }))}
          />
        </section>
      ) : null}

      {!signee && colocataires < 8 ? (
        <section className="panneau-espace mt-8">
          <h2 className="text-xl font-bold">{t.formulaire.ajoutTitre}</h2>
          <p className="text-muted mt-2 mb-5 text-[14px] font-medium">{t.formulaire.ajoutAide}</p>
          <FormulaireColocation verifiee={c.agence.statut === 'verifiee'} colocationId={id} />
        </section>
      ) : null}
    </div>
  )
}
