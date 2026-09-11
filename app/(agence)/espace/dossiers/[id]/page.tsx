import { FormulaireComplement } from '@/components/forms/FormulaireComplement'
import { SupportDossier } from '@/components/dossiers/SupportDossier'
import { LectureOcr } from '@/components/dossiers/LectureOcr'
import { ExamenPiece } from '@/components/dossiers/ExamenPiece'
import { ResponsableDossier } from '@/components/dossiers/ResponsableDossier'
import { examen as texteExamen, type ExamenDocumentaire } from '@/lib/content/examen'
import { configurationOcr } from '@/lib/ocr/openrouter'
import { Complements } from '@/components/dossiers/Complements'
import { type Complement } from '@/lib/content/complements'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { BoutonsDecision } from '@/components/forms/BoutonsDecision'
import { Icone } from '@/components/ui/Icone'
import { contexteAgence } from '@/lib/agences/contexte'
import { acteurs, actions, dossier as texte, natures, statuts, tableau } from '@/lib/content/espace'
import { tailleLisible } from '@/lib/garant/validation'
import { cn } from '@/lib/utils'
import { lireCurseurJournal, pageJournal } from '@/lib/journal/pagination'
import { NavigationJournal } from '@/components/ui/NavigationJournal'
import { journal as texteJournal } from '@/lib/content/journal'
import { documentsDeclares, profilsRessources } from '@/lib/content/garant'

export const metadata: Metadata = {
  title: 'Dossier',
  robots: { index: false, follow: false },
}

const tons = {
  sky: 'bg-sky',
  sun: 'bg-sun',
  mint: 'bg-mint',
  flame: 'bg-flame text-ink',
  paper: 'bg-paper',
} as const

function euros(cents: unknown): string {
  return `${(Number(cents) / 100).toLocaleString('fr-FR')} €`
}

function date(valeur: unknown, heure = false): string {
  return new Date(String(valeur)).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(heure ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

/**
 * Un dossier, tel que l'agence le voit.
 *
 * C'est l'ecran de demonstration de la feuille de route, et le seul endroit du
 * produit ou les chiffres apparaissent tous : le ratio face au seuil, le
 * montant, le revenu declare. L'agence decide, et elle decide sur des nombres.
 *
 * Chaque affichage est inscrit au journal. Ce n'est pas une ouverture de piece,
 * donc l'echec de l'inscription n'empeche pas la page : la regle stricte est
 * reservee a ce qui dechiffre.
 */
export default async function PageDossier({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') redirect('/connexion')
  const { supabase, agence } = contexte
  const curseur = lireCurseurJournal((await searchParams)?.avant, id)

  const [
    { data: d, error: erreurDossier },
    { data: e, error: erreurEngagement },
    { data: pieces, error: erreurPieces },
    { data: journal, error: erreurJournal },
    { data: demandes, error: erreurComplements },
    { data: examens, error: erreurExamens },
  ] = await Promise.all([
    supabase
      .from('dossiers')
      .select(
        'id, reference, statut, email_locataire, email_garant, loyer_cents, cree_le, expire_le, demonstration',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('engagements')
      .select(
        'couvre, montant_max_cents, jusqu_au, solidaire, revenu_net_mensuel_cents, ratio, calcule_le, profil_ressources',
      )
      .eq('dossier_id', id)
      .maybeSingle(),
    supabase
      .from('pieces')
      .select('id, type, taille_octets, depose_le, nombre_documents')
      .eq('dossier_id', id)
      .order('depose_le', { ascending: true }),
    supabase.rpc('journal_du_dossier', {
      le_dossier: id,
      avant_quand: curseur?.quand ?? null,
      avant_id: curseur?.id ?? null,
    }),
    supabase
      .from('complements_documentaires')
      .select('id,nature,motif,etat,piece_initiale,piece_fournie,cree_le,attendu_depuis')
      .eq('dossier_id', id)
      .order('cree_le', { ascending: true }),
    supabase.rpc('examens_du_dossier', { le_dossier: id }),
  ])

  if (
    erreurExamens ||
    erreurComplements ||
    erreurDossier ||
    erreurEngagement ||
    erreurPieces ||
    erreurJournal
  ) {
    throw new Error('Chargement du dossier indisponible.')
  }

  // La RLS a decide : un dossier d'une autre agence n'existe pas pour celle-ci.
  if (!d) notFound()
  const historique = pageJournal(journal, id)

  const { error: inscription } = await supabase.rpc('journaliser', {
    le_dossier: id,
    l_action: 'dossier_consulte',
    la_piece: null,
  })
  if (inscription) console.error('[agence] consultation non journalisee')

  const statut = statuts[String(d.statut)] ?? statuts.ouvert!
  const ratio = e?.ratio == null ? null : Number(e.ratio)
  const seuil = agence.seuilRatio
  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2 })

  const peutPrendre = d.statut === 'complet'
  const peutRefuser = ['complet', 'garant_insuffisant', 'transmis'].includes(String(d.statut))

  return (
    <div className="page-espace w-full max-w-[880px] self-start">
      <Link
        href="/espace"
        className="text-muted hover:text-cobalt text-[13px] font-bold underline-offset-2 hover:underline"
      >
        ← {texte.retour}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-full min-w-0">
          <p className="text-muted text-[13px] font-bold tracking-wide uppercase">
            {texte.reference} {String(d.reference)}
          </p>
          <h1 className="font-display mt-1 text-3xl break-all uppercase md:text-4xl">
            {String(d.email_locataire)}
          </h1>
        </div>
        <span
          className={cn(
            'border-ink inline-block rounded-full border-2 px-4 py-1.5 text-[13px] font-bold',
            tons[statut.ton],
          )}
        >
          {statut.libelle}
        </span>
      </div>

      {d.demonstration ? (
        <p className="bg-sky outlined mt-6 rounded-xl px-4 py-3 text-[14px] font-semibold">
          {tableau.demoBanniere}
        </p>
      ) : null}

      <Complements
        dossierId={id}
        demandes={(demandes ?? []) as Complement[]}
        pieces={pieces ?? []}
        agence={true}
        modifiable={['ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant'].includes(
          String(d.statut),
        )}
      />
      <ResponsableDossier
        dossierId={id}
        contexte={contexte}
        pageEquipe={(await searchParams)?.equipe}
        modifiable={[
          'ouvert',
          'depot_en_cours',
          'complet',
          'garant_insuffisant',
          'transmis',
        ].includes(String(d.statut))}
      />
      <dl className="mt-8 grid gap-4 text-[14px] md:grid-cols-3">
        <div className="outlined bg-paper rounded-xl p-4">
          <dt className="text-muted text-[11px] font-bold tracking-wide uppercase">
            {texte.garant}
          </dt>
          <dd className="mt-1 font-semibold">
            {d.email_garant ? String(d.email_garant) : texte.garantAucun}
          </dd>
        </div>
        <div className="outlined bg-paper rounded-xl p-4">
          <dt className="text-muted text-[11px] font-bold tracking-wide uppercase">
            {texte.loyer}
          </dt>
          <dd className="mt-1 font-semibold">
            {d.loyer_cents == null ? texte.loyerAucun : euros(d.loyer_cents)}
          </dd>
        </div>
        <div
          className={cn(
            'outlined rounded-xl p-4',
            ratio == null ? 'bg-paper' : ratio >= seuil ? 'bg-mint' : 'bg-sun',
          )}
        >
          <dt className="text-[11px] font-bold tracking-wide uppercase">{texte.ratioTitre}</dt>
          <dd className="mt-1 font-semibold">
            {ratio == null ? (
              texte.ratioAttente
            ) : (
              <>
                <span className="font-display text-2xl">{fmt(ratio)}×</span>
                <span className="block text-[12px] font-medium">
                  {texte.ratio(fmt(ratio), fmt(seuil))}
                </span>
              </>
            )}
          </dd>
        </div>
      </dl>

      <section className="panneau-espace mt-12">
        <h2 className="font-display text-2xl uppercase">{texte.engagementTitre}</h2>
        {e ? (
          <dl className="mt-4 grid gap-x-8 gap-y-2 text-[14px] md:grid-cols-2">
            <div className="border-ink/20 flex justify-between gap-4 border-b py-2">
              <dt className="text-muted font-medium">Couvre</dt>
              <dd className="font-semibold">
                {texte.couvre[e.couvre as 'loyer' | 'loyer_charges']}
              </dd>
            </div>
            <div className="border-ink/20 flex justify-between gap-4 border-b py-2">
              <dt className="text-muted font-medium">{texte.montant}</dt>
              <dd className="font-semibold">
                {e.montant_max_cents == null ? texte.sansPlafond : euros(e.montant_max_cents)}
              </dd>
            </div>
            <div className="border-ink/20 flex justify-between gap-4 border-b py-2">
              <dt className="text-muted font-medium">{texte.jusquAu}</dt>
              <dd className="font-semibold">{e.jusqu_au ? date(e.jusqu_au) : texte.dureeDuBail}</dd>
            </div>
            <div className="border-ink/20 flex justify-between gap-4 border-b py-2">
              <dt className="text-muted font-medium">Nature</dt>
              <dd className="font-semibold">{e.solidaire ? texte.solidaire : texte.simple}</dd>
            </div>
            <div className="border-ink/20 flex justify-between gap-4 border-b py-2">
              <dt className="text-muted font-medium">{texte.revenu}</dt>
              <dd className="font-semibold">
                {e.revenu_net_mensuel_cents == null
                  ? texte.revenuAucun
                  : euros(e.revenu_net_mensuel_cents)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-muted mt-4 text-[15px] font-medium">{texte.engagementAucun}</p>
        )}
      </section>

      <section className="panneau-espace mt-12">
        <h2 className="font-display text-2xl uppercase">{texte.piecesTitre}</h2>
        <p className="text-muted mt-2 text-sm">{documentsDeclares.presence}</p>
        <p className="mt-2 text-sm">{texteExamen.aide}</p>
        <p className="mt-2 text-sm font-bold">
          {profilsRessources.find((p) => p.valeur === (e?.profil_ressources ?? 'salarie'))?.libelle}
        </p>
        <p className="text-muted mt-2 mb-6 text-[13px] leading-relaxed font-medium">
          {texte.ouvrirAide}
        </p>
        {!pieces || pieces.length === 0 ? (
          <p className="text-muted text-[15px] font-medium">{texte.piecesAucune}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pieces.map((p) => (
              <li
                key={String(p.id)}
                className="bg-paper outlined flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-[14px]"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Icone nom="fichier" className="size-4" />
                  {natures[String(p.type)] ?? String(p.type)}
                  <span className="text-muted font-medium">
                    {documentsDeclares.bilan(Number(p.nombre_documents ?? 1))},{' '}
                    {tailleLisible(Number(p.taille_octets))}, {date(p.depose_le)}
                  </span>
                </span>
                <a
                  href={`/espace/pieces/${String(p.id)}`}
                  target="_blank"
                  rel="noopener"
                  className="press outlined bg-paper shadow-brut-xs rounded-[10px] px-4 py-2 text-[13px] font-bold"
                >
                  {texte.ouvrir}
                </a>
                {configurationOcr() ? <LectureOcr pieceId={String(p.id)} /> : null}
                <ExamenPiece
                  dossierId={id}
                  pieceId={String(p.id)}
                  precedent={(examens as ExamenDocumentaire[] | null)?.find(
                    (e) => e.piece_id === p.id,
                  )}
                  obsolete={demandes?.some((c) => c.piece_initiale === p.id) ?? false}
                  modifiable={[
                    'ouvert',
                    'depot_en_cours',
                    'complet',
                    'garant_insuffisant',
                    'transmis',
                  ].includes(String(d.statut))}
                />
                {['depot_en_cours', 'complet', 'garant_insuffisant', 'transmis'].includes(
                  String(d.statut),
                ) && !demandes?.some((c) => c.piece_initiale === p.id) ? (
                  <FormulaireComplement dossierId={id} cible={String(p.id)} operation="demander" />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panneau-espace mt-12">
        <h2 className="font-display text-2xl uppercase">{texte.actionsTitre}</h2>
        <div className="mt-6">
          {d.statut === 'transmis' || d.statut === 'signe' ? (
            <p className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
              {texte.prisTexte}
            </p>
          ) : d.statut === 'refuse' ? (
            <p className="bg-paper outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
              {texte.refuseTexte}
            </p>
          ) : null}
          {peutPrendre || peutRefuser ? (
            <div className="mt-4">
              <BoutonsDecision dossierId={id} peutPrendre={peutPrendre} peutRefuser={peutRefuser} />
            </div>
          ) : null}
        </div>
      </section>

      <section id="journal" className="panneau-espace mt-12">
        <h2 className="font-display text-2xl uppercase">{texte.journalTitre}</h2>
        {historique.lignes.length === 0 ? (
          <p className="text-muted mt-4 text-[15px] font-medium">{texte.journalAucun}</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-1 text-[14px]">
            {historique.lignes.map((j) => (
              <li
                key={j.id}
                className="border-ink/20 flex flex-wrap justify-between gap-3 border-b py-2"
              >
                <span className="max-w-full min-w-0 font-medium break-words">
                  <strong>{j.identite ?? acteurs[j.acteur] ?? texteJournal.inconnu}</strong>{' '}
                  {actions[j.action] ?? texteJournal.acces}
                </span>
                <span className="text-muted font-medium">{date(j.quand, true)}</span>
              </li>
            ))}
          </ol>
        )}
        <NavigationJournal
          chemin={`/espace/dossiers/${id}`}
          suivant={historique.suivant}
          ancien={curseur !== null}
        />
      </section>

      <p className="text-muted mt-10 text-[13px] font-medium">
        Ouvert le {date(d.cree_le)}, expire le {date(d.expire_le)}.
      </p>
      <SupportDossier reference={String(d.reference)} espace="agence" />
    </div>
  )
}
