import { Complements } from '@/components/dossiers/Complements'
import { SupportDossier } from '@/components/dossiers/SupportDossier'
import { type Complement } from '@/lib/content/complements'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { BoutonRetrait } from '@/components/forms/BoutonRetrait'
import { FormulaireDepot } from '@/components/forms/FormulaireDepot'
import { FormulaireNombreDocuments } from '@/components/forms/FormulaireNombreDocuments'
import {
  FormulaireEngagement,
  type EngagementAffiche,
} from '@/components/forms/FormulaireEngagement'
import { Icone } from '@/components/ui/Icone'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { FormulaireMention } from '@/components/forms/FormulaireMention'
import {
  depot,
  engagement as texteEngagement,
  mention as texteMention,
  natures,
  naturesDuProfil,
  profilsRessources,
  documentsDeclares,
  type ProfilRessources,
} from '@/lib/content/garant'
import { tailleLisible } from '@/lib/garant/validation'
import { lireCurseurJournal, pageJournal } from '@/lib/journal/pagination'
import { NavigationJournal } from '@/components/ui/NavigationJournal'
import { journal as texteJournal } from '@/lib/content/journal'

export const metadata: Metadata = {
  title: 'Ton dépôt',
  robots: { index: false, follow: false },
}

/** Tant que le dossier est la, le garant depose et corrige. Apres, il regarde. */
const STATUTS_OUVERTS = new Set(['ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant'])

type Piece = {
  id: string
  type: string
  taille_octets: number
  depose_le: string
  nombre_documents?: number
}

/**
 * L'espace du garant : ce qu'il couvre, et ses pieces.
 *
 * C'est la que se joue l'essentiel de l'abandon. Chaque nature dit ce qu'on
 * attend et combien, un fichier s'ajoute en un geste depuis le telephone, et
 * ce qui est depose se voit avec sa taille et sa date, retirable tant que le
 * dossier n'est pas parti.
 *
 * Ce que cette page ne montre pas : le ratio, ni le seuil, ni un verdict. Le
 * garant depose ; l'agence decide. A distinguer de la cloison du locataire :
 * ici c'est un choix d'ecran, pas une barriere. Le garant lit sa propre ligne
 * d'`engagements`, ratio compris, et c'est juste, puisque ce ratio est calcule
 * a partir de ses propres pieces. On ne l'affiche pas parce qu'un chiffre sans
 * le seuil qui va avec inquiete sans renseigner.
 */
export default async function PageGarant({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const porteur = await capaciteDepuisCookies()
  if (!porteur) redirect('/lien-invalide')
  if (porteur.capacite.partie !== 'garant') redirect('/locataire')

  const supabase = clientPorteurDeLien(porteur.jeton)
  const { dossierId } = porteur.capacite
  const curseur = lireCurseurJournal((await searchParams)?.avant, dossierId)

  const [
    { data: dossier, error: erreurDossier },
    { data: engagement, error: erreurEngagement },
    { data: pieces, error: erreurPieces },
    { data: journal, error: erreurJournal },
    { data: demandes, error: erreurComplements },
  ] = await Promise.all([
    supabase
      .from('dossiers')
      .select('reference, email_locataire, statut')
      .eq('id', dossierId)
      .maybeSingle(),
    supabase
      .from('engagements')
      .select(
        'couvre, montant_max_cents, jusqu_au, solidaire, revenu_net_mensuel_cents, nom, prenom, adresse, mention, mention_saisie_le, version_conditions, profil_ressources',
      )
      .eq('dossier_id', dossierId)
      .maybeSingle(),
    supabase
      .from('pieces')
      .select('id, type, taille_octets, depose_le, nombre_documents')
      .eq('dossier_id', dossierId)
      .order('depose_le', { ascending: true }),
    supabase.rpc('journal_du_dossier', {
      le_dossier: dossierId,
      avant_quand: curseur?.quand ?? null,
      avant_id: curseur?.id ?? null,
    }),
    supabase
      .from('complements_documentaires')
      .select('id,nature,motif,etat,piece_initiale,piece_fournie,cree_le,attendu_depuis')
      .eq('dossier_id', dossierId)
      .order('cree_le', { ascending: true }),
  ])

  if (erreurComplements || erreurDossier || erreurEngagement || erreurPieces) {
    throw new Error('Chargement du dossier indisponible.')
  }
  if (!dossier) redirect('/lien-invalide')
  const historique = pageJournal(erreurJournal ? null : journal, dossierId)

  const ouvert = STATUTS_OUVERTS.has(String(dossier.statut))

  // La preparation reste possible pendant le depot, des qu'un plafond existe.
  // Apres transmission les conditions et la mention sont figees par la base.
  const mentionAttendue = ouvert && engagement && Number(engagement.montant_max_cents) > 0
  const deposees = (pieces ?? []) as Piece[]
  const profil: ProfilRessources =
    engagement?.profil_ressources === 'retraite'
      ? 'retraite'
      : engagement?.profil_ressources === 'independant'
        ? 'independant'
        : 'salarie'
  const attendues = naturesDuProfil(profil)
  const visibles = natures.filter(
    (n) =>
      attendues.some((a) => a.valeur === n.valeur) || deposees.some((p) => p.type === n.valeur),
  )

  const engagementAffiche: EngagementAffiche = engagement
    ? {
        profil,
        couvre: engagement.couvre as 'loyer' | 'loyer_charges',
        montant:
          engagement.montant_max_cents == null
            ? ''
            : (Number(engagement.montant_max_cents) / 100).toLocaleString('fr-FR'),
        jusquAu: engagement.jusqu_au ? String(engagement.jusqu_au) : '',
        solidaire: Boolean(engagement.solidaire),
        revenu:
          engagement.revenu_net_mensuel_cents == null
            ? ''
            : (Number(engagement.revenu_net_mensuel_cents) / 100).toLocaleString('fr-FR'),
      }
    : null

  return (
    <div className="page-espace w-full max-w-[640px]">
      <p className="text-muted text-[13px] font-bold tracking-wide uppercase">
        {depot.reference} {String(dossier.reference)}
      </p>
      <h1 className="font-display mt-2 text-3xl uppercase md:text-4xl">{depot.titre}</h1>
      <p className="mt-3 text-[15px] leading-relaxed font-medium">
        {depot.demandePar(String(dossier.email_locataire))}
      </p>

      <div className="bg-sky outlined shadow-brut mt-6 flex items-start gap-3 rounded-[18px] p-5">
        <Icone nom="cadenas" className="mt-0.5 size-5 shrink-0" />
        <p className="text-[14px] leading-relaxed font-medium">{depot.discretion}</p>
      </div>

      {!ouvert ? (
        <div className="bg-sun outlined shadow-brut mt-8 rounded-[18px] p-6">
          <p className="font-display text-xl uppercase">{depot.fermeTitre}</p>
          <p className="mt-2 text-[15px] leading-relaxed font-medium">{depot.fermeTexte}</p>
        </div>
      ) : null}

      <Complements
        dossierId={dossierId}
        demandes={(demandes ?? []) as Complement[]}
        pieces={deposees}
        agence={false}
        modifiable={ouvert}
      />
      <section className="panneau-espace mt-12">
        <h2 className="font-display text-2xl uppercase">{depot.piecesTitre}</h2>
        <p className="text-muted mt-2 mb-8 text-[14px] font-medium">{depot.formats}</p>
        <p className="text-muted mb-6 text-sm">{documentsDeclares.presence}</p>
        <p className="mb-6 text-sm">
          {documentsDeclares.profil(profilsRessources.find((p) => p.valeur === profil)!.libelle)}
          {ouvert ? (
            <a href="#engagement" className="ml-2 font-bold underline">
              {documentsDeclares.changerProfil}
            </a>
          ) : null}
        </p>

        <ol className="flex flex-col gap-8">
          {visibles.map((nature) => {
            const siennes = deposees.filter((p) => p.type === nature.valeur)
            const complete =
              nature.attendu > 0 &&
              siennes.reduce((s, p) => s + (p.nombre_documents ?? 1), 0) >= nature.attendu

            return (
              <li key={nature.valeur} className="border-ink border-t-2 pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="flex items-center gap-2 text-[16px] font-bold">
                      {nature.libelle}
                      {complete ? <Icone nom="coche" className="text-cobalt size-5" /> : null}
                    </h3>
                    <p className="text-muted mt-1 text-[13px] font-medium">{nature.aide}</p>
                  </div>
                </div>

                {siennes.length > 0 ? (
                  <ul className="mt-4 flex flex-col gap-2">
                    {siennes.map((piece) => (
                      <li
                        key={piece.id}
                        className="bg-paper outlined flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
                      >
                        <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                          <Icone nom="fichier" className="size-4" />
                          {tailleLisible(piece.taille_octets)}
                          <span>{documentsDeclares.bilan(piece.nombre_documents ?? 1)}</span>
                          <span className="text-muted">
                            {depot.deposeLe(
                              new Date(piece.depose_le).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                              }),
                            )}
                          </span>
                        </span>
                        <a className="font-bold underline" href={`/garant/pieces/${piece.id}`}>
                          {depot.original}
                        </a>
                        {ouvert ? <BoutonRetrait dossierId={dossierId} pieceId={piece.id} /> : null}
                        {ouvert && ['bulletin_paie', 'bilan_comptable'].includes(piece.type) ? (
                          <FormulaireNombreDocuments
                            dossierId={dossierId}
                            pieceId={piece.id}
                            actuel={piece.nombre_documents ?? 1}
                            maximum={piece.type === 'bulletin_paie' ? 3 : 2}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {ouvert ? (
                  <div className="mt-4">
                    <FormulaireDepot
                      dossierId={dossierId}
                      nature={nature.valeur}
                      libelle={nature.libelle}
                    />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      </section>

      {mentionAttendue ? (
        <section className="panneau-espace mt-14">
          <h2 className="font-display text-2xl uppercase">{texteMention.titre}</h2>
          <p className="mt-2 mb-8 text-[15px] leading-relaxed font-medium">{texteMention.intro}</p>
          <FormulaireMention
            key={Number(engagement?.version_conditions ?? 0)}
            version={Number(engagement?.version_conditions ?? 0)}
            dossierId={dossierId}
            actuel={
              engagement
                ? {
                    nom: engagement.nom ? String(engagement.nom) : '',
                    prenom: engagement.prenom ? String(engagement.prenom) : '',
                    adresse: engagement.adresse ? String(engagement.adresse) : '',
                    mention: engagement.mention ? String(engagement.mention) : '',
                    apposeeLe: engagement.mention_saisie_le
                      ? String(engagement.mention_saisie_le)
                      : null,
                  }
                : null
            }
            solidaire={Boolean(engagement?.solidaire ?? true)}
          />
        </section>
      ) : null}

      <section id="journal" className="panneau-espace mt-14">
        <h2 className="font-display text-2xl uppercase">{texteJournal.titre}</h2>
        <p className="text-muted mt-2 text-sm">{texteJournal.aide}</p>
        {erreurJournal ? (
          <p role="alert">{texteJournal.indisponible}</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {historique.lignes.map(
              (entree: {
                id: string
                action: string
                acteur: string
                identite: string | null
                quand: string
              }) => (
                <li key={entree.id} className="border-ink border-t pt-3 text-sm break-words">
                  <time dateTime={entree.quand}>
                    {new Date(entree.quand).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
                  </time>
                  {' : '}
                  {texteJournal.actions[entree.action] ?? texteJournal.acces}
                  {texteJournal.par}
                  {entree.identite ?? texteJournal.acteurs[entree.acteur] ?? texteJournal.inconnu}.
                </li>
              ),
            )}
            {!historique.lignes.length ? <li>{texteJournal.aucun}</li> : null}
          </ol>
        )}
        {!erreurJournal ? (
          <NavigationJournal
            chemin="/garant"
            suivant={historique.suivant}
            ancien={curseur !== null}
          />
        ) : null}
      </section>
      <section id="engagement" className="panneau-espace mt-14">
        <h2 className="font-display text-2xl uppercase">{texteEngagement.titre}</h2>
        <p className="text-muted mt-2 mb-8 text-[14px] leading-relaxed font-medium">
          {texteEngagement.aide}
        </p>
        {ouvert ? (
          <FormulaireEngagement
            key={Number(engagement?.version_conditions ?? 0)}
            version={Number(engagement?.version_conditions ?? 0)}
            dossierId={dossierId}
            actuel={engagementAffiche}
          />
        ) : (
          <p className="text-[15px] font-medium">
            {engagementAffiche
              ? `${engagementAffiche.couvre === 'loyer' ? 'Le loyer seul' : 'Le loyer et les charges'}${engagementAffiche.montant ? `, jusqu’à ${engagementAffiche.montant} € au total` : ''}${engagementAffiche.jusquAu ? `, jusqu’au ${engagementAffiche.jusquAu}` : ''}${engagementAffiche.solidaire ? ', caution solidaire' : ''}.`
              : 'Aucun engagement déclaré.'}
          </p>
        )}
      </section>
      <SupportDossier reference={String(dossier.reference)} espace="garant" />
    </div>
  )
}
