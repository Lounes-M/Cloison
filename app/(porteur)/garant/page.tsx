import { maColocation } from '@/lib/acces/ma-colocation'
import { colocation as texteColocationFr } from '@/lib/content/colocation'
import { colocation as texteColocationEn } from '@/lib/content/en/colocation'
import { euros as eurosFr } from '@/lib/content/tarifs'
import { euros as eurosEn } from '@/lib/content/en/tarifs'
import { FriseAvancement } from '@/components/dossiers/FriseAvancement'
import { frise as friseFr } from '@/lib/content/frise'
import { etapesGarant } from '@/lib/dossiers/frise'
import { SommaireDossier } from '@/components/layout/SommaireDossier'
import { interfaceEspace as interfaceEspaceFr } from '@/lib/content/interface'
import { SuiviSignature } from '@/components/dossiers/SuiviSignature'
import { FormulaireReutilisation } from '@/components/forms/FormulaireReutilisation'
import { Complements } from '@/components/dossiers/Complements'
import { SupportDossier } from '@/components/dossiers/SupportDossier'
import { type Complement } from '@/lib/content/complements'
import { redirect } from 'next/navigation'
import { configurationLectureGarant } from '@/lib/ocr/extraction-revenus'
import { estNatureLisible } from '@/lib/ocr/revenus'

import { BoutonRetrait } from '@/components/forms/BoutonRetrait'
import { FormulaireDepot } from '@/components/forms/FormulaireDepot'
import { FormulaireNombreDocuments } from '@/components/forms/FormulaireNombreDocuments'
import {
  FormulaireEngagement,
  type EngagementAffiche,
} from '@/components/forms/FormulaireEngagement'
import { Icone } from '@/components/ui/Icone'
import { informationCollecte as informationCollecteFr } from '@/lib/content/information-collecte'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { natureDepuis } from '@/lib/garant/validation'
import { FormulaireMention } from '@/components/forms/FormulaireMention'
import {
  depot as depotFr,
  engagement as texteEngagementFr,
  mention as texteMentionFr,
  natures as naturesFr,
  naturesDuProfil,
  profilsRessources as profilsRessourcesFr,
  documentsDeclares as documentsDeclaresFr,
  type ProfilRessources,
} from '@/lib/content/garant'
import { tailleLisible } from '@/lib/garant/validation'
import { lireCurseurJournal, pageJournal } from '@/lib/journal/pagination'
import { NavigationJournal } from '@/components/ui/NavigationJournal'
import { journal as texteJournalFr } from '@/lib/content/journal'
import { agenceDuDossier } from '@/lib/acces/agence-du-dossier'
import { agenceDuDossier as texteAgenceFr } from '@/lib/content/agence-du-dossier'
import { ResteAFaireGarant } from '@/components/dossiers/ResteAFaireGarant'
import { resteAFaire } from '@/lib/garant/reste-a-faire'
import { frise as friseEn } from '@/lib/content/en/frise'
import { interfaceEspace as interfaceEspaceEn } from '@/lib/content/en/interface'
import { informationCollecte as informationCollecteEn } from '@/lib/content/en/information-collecte'
import {
  depot as depotEn,
  engagement as texteEngagementEn,
  mention as texteMentionEn,
  natures as naturesEn,
  profilsRessources as profilsRessourcesEn,
  documentsDeclares as documentsDeclaresEn,
} from '@/lib/content/en/garant'
import { journal as texteJournalEn } from '@/lib/content/en/journal'
import { agenceDuDossier as texteAgenceEn } from '@/lib/content/en/agence-du-dossier'
import { signature as texteSignatureEn } from '@/lib/content/en/signature'
import { signature as texteSignatureFr } from '@/lib/content/signature'
import { choisir, lien, locale, deuxPoints, type Langue } from '@/lib/i18n'
import { langueEspace, titreEspace } from '@/lib/langue-espace'
import { titres as titresEn } from '@/lib/content/en/titres'
import { titres as titresFr } from '@/lib/content/titres'

export const generateMetadata = () => titreEspace(titresFr.garant, titresEn.garant)

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
/** Une date de calendrier (AAAA-MM-JJ) dans la langue du lecteur, sans decalage horaire. */
function dateCalendaire(iso: string, langue: Langue): string {
  const jour = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  return Number.isNaN(jour.getTime())
    ? iso
    : jour.toLocaleDateString(locale(langue), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
}

export default async function PageGarant({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const langue = await langueEspace()
  const natures = choisir(langue, naturesFr, naturesEn)
  const texteSignature = choisir(langue, texteSignatureFr, texteSignatureEn)
  const depot = choisir(langue, depotFr, depotEn)
  const texteAgence = choisir(langue, texteAgenceFr, texteAgenceEn)
  const texteColocation = choisir(langue, texteColocationFr, texteColocationEn)
  const euros = choisir(langue, eurosFr, eurosEn)
  const frise = choisir(langue, friseFr, friseEn)
  const interfaceEspace = choisir(langue, interfaceEspaceFr, interfaceEspaceEn)
  const informationCollecte = choisir(langue, informationCollecteFr, informationCollecteEn)
  const documentsDeclares = choisir(langue, documentsDeclaresFr, documentsDeclaresEn)
  const profilsRessources = choisir(langue, profilsRessourcesFr, profilsRessourcesEn)
  const texteMention = choisir(langue, texteMentionFr, texteMentionEn)
  const texteJournal = choisir(langue, texteJournalFr, texteJournalEn)
  const texteEngagement = choisir(langue, texteEngagementFr, texteEngagementEn)

  const porteur = await capaciteDepuisCookies()
  if (!porteur) redirect('/lien-invalide')
  if (porteur.capacite.partie !== 'garant') redirect('/locataire')

  const supabase = clientPorteurDeLien(porteur.jeton)
  const { dossierId } = porteur.capacite
  const parametres = await searchParams
  const deposee = natureDepuis(typeof parametres?.deposee === 'string' ? parametres.deposee : '')
  const curseur = lireCurseurJournal(parametres?.avant, dossierId)

  const [
    { data: dossier, error: erreurDossier },
    { data: engagement, error: erreurEngagement },
    { data: pieces, error: erreurPieces },
    { data: journal, error: erreurJournal },
    { data: demandes, error: erreurComplements },
  ] = await Promise.all([
    supabase
      .from('dossiers')
      .select('reference, email_locataire, statut, expire_le')
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
  const suivi = await agenceDuDossier(supabase)
  const coloc = suivi ? await maColocation(supabase) : null

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
  const attendues = naturesDuProfil(profil, natures)
  const visibles = natures.filter(
    (n) =>
      attendues.some((a) => a.valeur === n.valeur) || deposees.some((p) => p.type === n.valeur),
  )

  const restant = ouvert
    ? resteAFaire({
        profil,
        engagement: engagement
          ? {
              revenuDeclare: engagement.revenu_net_mensuel_cents != null,
              montantDeclare: Number(engagement.montant_max_cents) > 0,
              mentionApposee: Boolean(engagement.mention_saisie_le),
            }
          : null,
        pieces: deposees,
        demandes: (demandes ?? []) as Complement[],
        mentionAttendue: Boolean(mentionAttendue),
      })
    : null

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
      <h1 className="font-display mt-2 text-3xl md:text-4xl">{depot.titre}</h1>
      <p className="mt-3 text-[15px] leading-relaxed font-medium">
        {depot.demandePar(String(dossier.email_locataire))}
      </p>
      {suivi ? (
        <p className="mt-2 text-[14px] leading-relaxed font-semibold">
          {texteAgence.garant(suivi)}
        </p>
      ) : null}
      {coloc ? (
        <p className="mt-2 text-[14px] leading-relaxed font-medium">
          {coloc.garantis > 1
            ? (coloc.etendue === 'loyer_entier'
                ? texteColocation.garant.communEntier
                : texteColocation.garant.communPart)(
                coloc.garantis,
                coloc.colocataires,
                euros(coloc.loyerTotalCents),
              )
            : (coloc.etendue === 'loyer_entier'
                ? texteColocation.garant.loyerEntier
                : texteColocation.garant.part)(coloc.colocataires, euros(coloc.loyerTotalCents))}
          {coloc.commune ? ` ${texteColocation.garant.commune}` : ''}
        </p>
      ) : null}

      <div className="message-info mt-5 flex items-start gap-3">
        <Icone nom="cadenas" className="mt-0.5 size-5 shrink-0" />
        <p className="text-[14px] leading-relaxed font-medium">{depot.discretion}</p>
      </div>

      {!ouvert ? (
        <div className="bg-sun outlined shadow-brut mt-8 rounded-[18px] p-6">
          <p className="font-display text-xl">{depot.fermeTitre}</p>
          <p className="mt-2 text-[15px] leading-relaxed font-medium">{depot.fermeTexte}</p>
        </div>
      ) : null}

      <FriseAvancement
        titre={frise.garant.titre}
        etapes={etapesGarant(String(dossier.statut), langue)}
      />

      {restant ? <ResteAFaireGarant etapes={restant} /> : null}

      <SommaireDossier
        liens={[
          { id: 'engagement', titre: interfaceEspace.engagement },
          { id: 'pieces', titre: interfaceEspace.pieces },
          ...(process.env.SIGNATURE_PARCOURS_ENABLED === 'true'
            ? [{ id: 'signature', titre: texteSignature.titre }]
            : []),
          { id: 'journal', titre: interfaceEspace.historique },
        ]}
      />
      <section id="engagement" tabIndex={-1} className="panneau-espace mt-8">
        <h2 className="text-xl font-bold">{texteEngagement.titre}</h2>
        <p className="text-muted mt-2 mb-8 text-[14px] leading-relaxed font-medium">
          {texteEngagement.aide}
        </p>
        {ouvert ? (
          <FormulaireEngagement
            key={Number(engagement?.version_conditions ?? 0)}
            version={Number(engagement?.version_conditions ?? 0)}
            dossierId={dossierId}
            actuel={engagementAffiche}
            lectureIa={
              configurationLectureGarant() !== null &&
              deposees.some((piece) => estNatureLisible(piece.type))
            }
          />
        ) : (
          <p className="text-[15px] font-medium">
            {engagementAffiche
              ? `${engagementAffiche.couvre === 'loyer' ? texteEngagement.resume.loyer : texteEngagement.resume.loyerCharges}${engagementAffiche.montant ? `${texteEngagement.resume.plafond} ${engagementAffiche.montant} ${texteEngagement.resume.auTotal}` : ''}${engagementAffiche.jusquAu ? `${texteEngagement.resume.jusquAu} ${dateCalendaire(engagementAffiche.jusquAu, langue)}` : ''}${engagementAffiche.solidaire ? texteEngagement.resume.solidaire : ''}.`
              : texteEngagement.resume.aucun}
          </p>
        )}
      </section>
      <Complements
        dossierId={dossierId}
        demandes={(demandes ?? []) as Complement[]}
        pieces={deposees}
        agence={false}
        modifiable={ouvert}
      />
      <section id="pieces" tabIndex={-1} className="panneau-espace mt-6">
        <h2 className="text-xl font-bold">{depot.piecesTitre}</h2>
        <p className="mt-2 text-[15px] font-semibold">
          {documentsDeclares.profil(profilsRessources.find((p) => p.valeur === profil)!.libelle)}
          {ouvert ? (
            <a href="#engagement" className="ml-2 font-bold underline underline-offset-4">
              {documentsDeclares.changerProfil}
            </a>
          ) : null}
        </p>
        <p className="mt-2 text-[14px] font-medium">{depot.formats}</p>
        <div className="border-ink/15 text-muted mt-3 mb-6 flex flex-col gap-1.5 border-l-2 pl-4 text-[13px] leading-relaxed font-medium">
          <p>
            {informationCollecte.garant}{' '}
            <a href={lien(langue, '/confidentialite')} className="underline underline-offset-4">
              {informationCollecte.lien}
            </a>
          </p>
          <p>{documentsDeclares.presence}</p>
        </div>

        <ol className="flex flex-col gap-8">
          {visibles.map((nature) => {
            const siennes = deposees.filter((p) => p.type === nature.valeur)
            const complete =
              nature.attendu > 0 &&
              siennes.reduce((s, p) => s + (p.nombre_documents ?? 1), 0) >= nature.attendu

            return (
              <li
                key={nature.valeur}
                id={`piece-${nature.valeur}`}
                tabIndex={-1}
                className="border-ink scroll-mt-6 border-t-2 pt-6"
              >
                {deposee === nature.valeur ? (
                  <p role="status" className="message-succes mb-4">
                    {depot.depose}
                  </p>
                ) : null}
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
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold">
                          <Icone nom="fichier" className="size-4" />
                          <span>{documentsDeclares.bilan(piece.nombre_documents ?? 1)}</span>
                          <span className="text-muted font-medium">
                            {depot.deposeLe(
                              new Date(piece.depose_le).toLocaleDateString(locale(langue), {
                                day: 'numeric',
                                month: 'long',
                                timeZone: 'Europe/Paris',
                              }),
                            )}
                            {' · '}
                            {tailleLisible(piece.taille_octets, langue)}
                          </span>
                        </span>
                        <a
                          className="text-cobalt inline-flex min-h-[44px] items-center text-[13px] font-bold underline underline-offset-2"
                          href={`/garant/pieces/${piece.id}`}
                        >
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
        {ouvert ? <FormulaireReutilisation dossierId={dossierId} /> : null}
      </section>

      {mentionAttendue ? (
        <section id="mention" tabIndex={-1} className="panneau-espace mt-8">
          <h2 className="text-xl font-bold">{texteMention.titre}</h2>
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

      {!mentionAttendue && engagement?.mention ? (
        <section id="mention" tabIndex={-1} className="panneau-espace mt-8">
          <h2 className="text-xl font-bold">{texteMention.titre}</h2>
          <p className="text-muted mt-2 text-[14px] leading-relaxed font-medium">
            {texteMention.figee}
          </p>
          <blockquote className="border-ink/30 mt-4 border-l-4 pl-4 text-[15px] leading-relaxed font-medium whitespace-pre-wrap">
            {String(engagement.mention)}
          </blockquote>
        </section>
      ) : null}

      <SuiviSignature db={supabase} dossier={dossierId} partie="garant" />
      <section id="journal" tabIndex={-1} className="panneau-espace mt-8">
        <h2 className="text-xl font-bold">{texteJournal.titre}</h2>
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
                    {new Date(entree.quand).toLocaleString(locale(langue), {
                      timeZone: 'Europe/Paris',
                    })}
                  </time>
                  {deuxPoints(langue)}
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
      {dossier.expire_le ? (
        <p className="text-muted mt-10 text-[13px] font-medium">
          {depot.expire(
            new Date(String(dossier.expire_le)).toLocaleDateString(locale(langue), {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'Europe/Paris',
            }),
          )}
        </p>
      ) : null}
      <SupportDossier reference={String(dossier.reference)} espace="garant" />
    </div>
  )
}
