import type { Metadata } from 'next'
import { applicationSecours } from '@/lib/content/application-secours'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { FormulaireActivation } from '@/components/forms/FormulaireActivation'
import { FormulaireNomAgence } from '@/components/forms/FormulaireNomAgence'
import { FormulaireNouveauDossier } from '@/components/forms/FormulaireNouveauDossier'
import { FormulaireSeuil } from '@/components/forms/FormulaireSeuil'
import { ouvrirMaDemonstration } from '@/lib/agences/action-demonstration'
import { contexteAgence } from '@/lib/agences/contexte'
import { activation, statuts, tableau } from '@/lib/content/espace'
import { cn } from '@/lib/utils'
import { collaborateurs } from '@/lib/content/collaborateurs'
import { connecteurs } from '@/lib/content/connecteurs'
import { preferences } from '@/lib/content/preferences'
import { rappels } from '@/lib/content/rappels'
import {
  responsables as texteResponsables,
  type ResponsableDossier,
} from '@/lib/content/responsables'

export const metadata: Metadata = {
  title: 'Espace agence',
  robots: { index: false, follow: false },
}

const tons = {
  sky: 'bg-sky',
  sun: 'bg-sun',
  mint: 'bg-mint',
  flame: 'bg-flame text-ink',
  paper: 'bg-paper',
} as const

type Ligne = {
  id: string
  reference: string
  email_locataire: string
  statut: string
  cree_le: string
  demonstration: boolean
  engagements: { ratio: string | null } | { ratio: string | null }[] | null
}

function ratioDe(ligne: Ligne): string | null {
  const e = Array.isArray(ligne.engagements) ? ligne.engagements[0] : ligne.engagements
  return e?.ratio == null
    ? null
    : Number(e.ratio).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
}

/**
 * L'espace agence : ses dossiers, et de quoi en ouvrir un.
 *
 * Le rattachement est rejoue a chaque visite, ce que la fonction supporte :
 * elle est idempotente et rend l'agence deja rattachee. Cela evite un etat
 * « compte cree mais pas rattache » qu'il faudrait rattraper autrement.
 */
export default async function PageEspace({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
} = {}) {
  const contexte = await contexteAgence()
  if (contexte.etat === 'anonyme') redirect('/connexion')

  if (contexte.etat === 'non-rattache') {
    const { rattachement, email } = contexte

    if (rattachement.etat === 'nom-requis') {
      return (
        <div className="page-espace w-full max-w-[440px]">
          <h1 className="font-display text-3xl uppercase md:text-4xl">Encore une chose</h1>
          <p className="text-muted mt-3 mb-8 text-[15px] leading-relaxed font-medium">
            Ton adresse est vérifiée. Il ne manque que le nom sous lequel ton agence apparaîtra.
          </p>
          <FormulaireNomAgence domaine={email.split('@')[1] ?? 'ton domaine'} />
        </div>
      )
    }

    if (rattachement.etat === 'refus') {
      return (
        <div className="page-espace w-full max-w-[440px] text-center">
          <h1 className="font-display text-3xl uppercase">Pas cette adresse</h1>
          <p className="mt-4 text-[15px] leading-relaxed font-medium">{rattachement.message}</p>
          <p className="text-muted mt-4 text-[14px] font-medium">
            Le rattachement se fait par le domaine de ton adresse : c&apos;est lui qui te relie à
            tes collègues, et une adresse personnelle ne relie à personne.
          </p>
        </div>
      )
    }

    return (
      <div className="page-espace w-full max-w-[440px] text-center">
        <h1 className="font-display text-3xl uppercase">Ça n&apos;a pas marché</h1>
        <p className="text-muted mt-4 text-[15px] font-medium">
          Réessaie dans un instant. Si ça persiste, écris-nous.
        </p>
      </div>
    )
  }

  const { agence, role, supabase, email } = contexte
  const verifiee = agence.statut === 'verifiee'

  const recherche = (await searchParams) ?? {}
  const numero =
    typeof recherche.page === 'string' && /^[1-9]\d{0,3}$/.test(recherche.page)
      ? Number(recherche.page)
      : 1
  const champ = (valeur: unknown) => (typeof valeur === 'string' ? valeur.trim().slice(0, 120) : '')
  const reference = champ(recherche.reference)
  const emailRecherche = champ(recherche.email)
  const etatRecherche = Object.hasOwn(statuts, champ(recherche.statut))
    ? champ(recherche.statut)
    : ''
  const attribution =
    recherche.responsable === 'mes' ? 'mes' : recherche.responsable === 'sans' ? 'sans' : 'tous'
  const motif = (valeur: string) => `%${valeur.replace(/[\\%_]/g, '\\$&')}%`
  const lienPage = (page: number) => {
    const params = new URLSearchParams({ page: String(page) })
    if (reference) params.set('reference', reference)
    if (emailRecherche) params.set('email', emailRecherche)
    if (etatRecherche) params.set('statut', etatRecherche)
    if (attribution !== 'tous') params.set('responsable', attribution)
    return `/espace?${params.toString()}` as const
  }
  let requete = supabase
    .from('dossiers')
    .select(
      'id, reference, email_locataire, statut, cree_le, demonstration, engagements(ratio), affecte:affectations_dossiers()',
    )
    .order('cree_le', { ascending: false })
    .order('id', { ascending: false })
  if (reference) requete = requete.ilike('reference', motif(reference))
  if (emailRecherche) requete = requete.ilike('email_locataire', motif(emailRecherche))
  if (etatRecherche) requete = requete.eq('statut', etatRecherche)
  if (attribution === 'mes')
    requete = requete.eq('affecte.membre_id', contexte.utilisateurId).not('affecte', 'is', null)
  if (attribution === 'sans')
    requete = requete.not('affecte.membre_id', 'is', null).is('affecte', null)
  const { data, error } = await requete.range((numero - 1) * 50, (numero - 1) * 50 + 50)
  if (error) throw new Error('Chargement du dossier indisponible.')
  const resultats = (data ?? []) as Ligne[]
  const suivante = resultats.length > 50 && numero < 9999
  const lignes = resultats.slice(0, 50)
  const affectations = lignes.length
    ? await supabase.rpc('responsables_des_dossiers', { les_dossiers: lignes.map((l) => l.id) })
    : { data: [], error: null }
  if (affectations.error) throw new Error('Chargement des responsables indisponible')
  const responsables = new Map(
    ((affectations.data ?? []) as ResponsableDossier[]).map((r) => [r.dossier_id, r]),
  )

  const seuil = agence.seuilRatio.toLocaleString('fr-FR', { minimumFractionDigits: 2 })

  return (
    <div className="page-espace w-full max-w-[880px] self-start">
      <h1 className="font-display text-3xl uppercase md:text-4xl">{agence.nom}</h1>
      <p className="text-muted mt-2 text-[14px] font-medium">
        Connecté en tant que <strong className="text-ink">{email}</strong>
        {role === 'admin' ? ', administrateur' : ''}.
      </p>

      <Link href="/espace/securite" className="lien-espace mt-5 mr-3">
        {applicationSecours.titre}
      </Link>
      <Link href="/espace/notifications" className="lien-espace mt-5 mr-3">
        {preferences.titre}
      </Link>
      {role === 'admin' ? (
        <Link href="/espace/rappels" className="lien-espace mt-5 mr-3">
          {rappels.titre}
        </Link>
      ) : null}
      {role === 'admin' ? (
        <Link href="/espace/connecteurs" className="lien-espace mt-5 mr-3">
          {connecteurs.titre}
        </Link>
      ) : null}
      {role === 'admin' ? (
        <Link href="/espace/collaborateurs" className="lien-espace mt-5">
          {collaborateurs.titre}
        </Link>
      ) : null}

      {!verifiee ? (
        <div className="bg-sun outlined shadow-brut mt-8 rounded-[18px] p-6">
          <p className="font-display text-xl uppercase">{tableau.nonVerifieeTitre}</p>
          <p className="mt-3 text-[15px] leading-relaxed font-medium">{tableau.nonVerifieeTexte}</p>

          <div className="border-ink mt-6 border-t-2 pt-6">
            <p className="font-display text-lg uppercase">{activation.titre}</p>
            <p className="mt-2 mb-5 text-[14px] leading-relaxed font-medium">{activation.texte}</p>
            {agence.activationDemandeeLe ? (
              <p className="bg-paper outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
                {activation.enAttente(
                  new Date(agence.activationDemandeeLe).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                  }),
                )}
              </p>
            ) : role === 'admin' ? (
              <FormulaireActivation siren={agence.siren ?? ''} cartePro={agence.cartePro ?? ''} />
            ) : (
              <p className="text-[14px] font-medium">{activation.membre}</p>
            )}
          </div>
        </div>
      ) : null}

      <section className="panneau-espace mt-12">
        <h2 className="font-display text-2xl uppercase">{tableau.dossiers}</h2>

        <form
          key={JSON.stringify([reference, emailRecherche, etatRecherche, attribution])}
          action="/espace"
          method="get"
          className="mt-5 grid gap-3 sm:flex sm:flex-wrap sm:items-end"
        >
          <label className="min-w-0 flex-1 text-sm font-semibold">
            {tableau.rechercheReference}
            <input
              name="reference"
              defaultValue={reference}
              maxLength={120}
              className="outlined mt-2 w-full rounded-lg px-3 py-2"
            />
          </label>
          <label className="min-w-0 flex-1 text-sm font-semibold">
            {tableau.rechercheEmail}
            <input
              name="email"
              defaultValue={emailRecherche}
              maxLength={120}
              className="outlined mt-2 w-full rounded-lg px-3 py-2"
            />
          </label>
          <label className="min-w-0 text-sm font-semibold">
            {texteResponsables.statut}
            <select
              name="statut"
              defaultValue={etatRecherche}
              className="outlined bg-paper mt-2 w-full rounded-lg px-3 py-2"
            >
              <option value="">{texteResponsables.tousStatuts}</option>
              {Object.entries(statuts).map(([v, s]) => (
                <option key={v} value={v}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm font-semibold">
            {texteResponsables.filtre}
            <select
              name="responsable"
              defaultValue={attribution}
              className="outlined bg-paper mt-2 w-full rounded-lg px-3 py-2"
            >
              {Object.entries(texteResponsables.filtres).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="press outlined bg-cobalt text-paper shadow-brut-xs cursor-pointer rounded-lg px-4 py-2 font-bold"
          >
            {tableau.rechercher}
          </button>
          {reference || emailRecherche || etatRecherche || attribution !== 'tous' ? (
            <Link href="/espace" className="px-2 py-2 text-sm underline">
              {tableau.effacer}
            </Link>
          ) : null}
        </form>

        {lignes.length === 0 ? (
          <p className="text-muted mt-4 text-[15px] font-medium">
            {numero > 1 || reference || emailRecherche || etatRecherche || attribution !== 'tous'
              ? tableau.aucunResultat
              : tableau.aucun}
          </p>
        ) : (
          <div className="mt-6">
            <ul className="grid gap-4 md:hidden" aria-label={tableau.dossiers}>
              {lignes.map((ligne) => {
                const statut = statuts[ligne.statut] ?? statuts.ouvert!
                const ratio = ratioDe(ligne)
                return (
                  <li key={ligne.id} className="outlined bg-cream rounded-xl p-4">
                    <Link
                      href={`/espace/dossiers/${ligne.id}`}
                      className="lien-espace mb-4 w-full break-all"
                    >
                      {ligne.reference}
                    </Link>
                    <dl className="grid gap-3 text-sm">
                      <div>
                        <dt className="text-muted text-xs font-bold">
                          {tableau.colonnes.locataire}
                        </dt>
                        <dd className="font-medium">
                          {ligne.email_locataire}
                          {ligne.demonstration ? (
                            <span className="block text-xs font-bold">{tableau.demonstration}</span>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted mb-1 text-xs font-bold">
                          {tableau.colonnes.statut}
                        </dt>
                        <dd>
                          <span
                            className={cn(
                              'outlined inline-block rounded-full px-3 py-1 text-xs font-bold',
                              tons[statut.ton],
                            )}
                          >
                            {statut.libelle}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted text-xs font-bold">{texteResponsables.titre}</dt>
                        <dd>
                          {responsables.get(ligne.id)?.responsable_id
                            ? (responsables.get(ligne.id)?.responsable_email ??
                              texteResponsables.indisponible)
                            : texteResponsables.aucun}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted text-xs font-bold">{tableau.colonnes.ratio}</dt>
                        <dd>{ratio ? `${ratio}×` : '·'}</dd>
                      </div>
                      <div>
                        <dt className="text-muted text-xs font-bold">{tableau.colonnes.ouvert}</dt>
                        <dd>
                          {new Date(ligne.cree_le).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </dd>
                      </div>
                    </dl>
                  </li>
                )
              })}
            </ul>
            <div className="outlined hidden overflow-x-auto rounded-[14px] md:block">
              <table className="w-full text-left text-[14px]">
                <thead className="bg-sky border-ink border-b-2 text-[12px] font-bold tracking-wide uppercase">
                  <tr>
                    <th className="px-4 py-3">{tableau.colonnes.reference}</th>
                    <th className="px-4 py-3">{tableau.colonnes.locataire}</th>
                    <th className="px-4 py-3">{tableau.colonnes.statut}</th>
                    <th className="px-4 py-3">{texteResponsables.titre}</th>
                    <th className="px-4 py-3">{tableau.colonnes.ratio}</th>
                    <th className="px-4 py-3">{tableau.colonnes.ouvert}</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne) => {
                    const statut = statuts[ligne.statut] ?? statuts.ouvert!
                    const ratio = ratioDe(ligne)
                    return (
                      <tr key={ligne.id} className="border-ink/20 border-b last:border-0">
                        <td className="px-4 py-3 font-bold">
                          <Link
                            href={`/espace/dossiers/${ligne.id}`}
                            className="hover:text-cobalt underline-offset-2 hover:underline"
                          >
                            {ligne.reference}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {ligne.email_locataire}
                          {ligne.demonstration ? (
                            <span className="text-muted ml-2 text-[11px] font-bold tracking-wide uppercase">
                              {tableau.demonstration}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'border-ink inline-block rounded-full border-2 px-3 py-1 text-[12px] font-bold',
                              tons[statut.ton],
                            )}
                          >
                            {statut.libelle}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm break-all">
                          {responsables.get(ligne.id)?.responsable_id
                            ? (responsables.get(ligne.id)?.responsable_email ??
                              texteResponsables.indisponible)
                            : texteResponsables.aucun}
                        </td>
                        <td className="px-4 py-3 font-medium">{ratio ? `${ratio}×` : '·'}</td>
                        <td className="text-muted px-4 py-3 font-medium">
                          {new Date(ligne.cree_le).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <nav
          aria-label={tableau.pagination}
          className="mt-5 flex flex-wrap items-center gap-4 text-sm font-semibold"
        >
          {numero > 1 ? (
            <Link href={lienPage(numero - 1)} className="underline">
              {tableau.precedente}
            </Link>
          ) : null}
          <span>{tableau.page(numero)}</span>
          {suivante ? (
            <Link href={lienPage(numero + 1)} className="underline">
              {tableau.suivante}
            </Link>
          ) : null}
        </nav>
      </section>

      <section className="panneau-espace mt-12 grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl uppercase">{tableau.nouveau}</h2>
          <div className="mt-6">
            <FormulaireNouveauDossier verifiee={verifiee} />
          </div>

          <div className="bg-sky outlined shadow-brut mt-10 rounded-[18px] p-6">
            <p className="font-display text-lg uppercase">{tableau.demoTitre}</p>
            <p className="mt-2 text-[14px] leading-relaxed font-medium">{tableau.demoAide}</p>
            {/* Une action serveur sans etat : elle se termine toujours par une
                redirection, vers le dossier de demonstration ou vers l'espace. */}
            <form action={ouvrirMaDemonstration} className="mt-4">
              <button
                type="submit"
                className="press outlined bg-paper shadow-brut-xs cursor-pointer rounded-[10px] px-5 py-3 text-[14px] font-bold"
              >
                {tableau.demoBouton}
              </button>
            </form>
          </div>
        </div>

        <div>
          <h2 className="font-display text-2xl uppercase">{tableau.seuilTitre}</h2>
          <p className="text-muted mt-2 mb-6 text-[13px] leading-relaxed font-medium">
            {tableau.seuilAide}
          </p>
          {role === 'admin' ? (
            <FormulaireSeuil seuilActuel={seuil} />
          ) : (
            <p className="text-[14px] font-medium">{tableau.seuilLecture(seuil)}</p>
          )}
        </div>
      </section>
    </div>
  )
}
