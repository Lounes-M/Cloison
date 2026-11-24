import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'

import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { Repere } from '@/components/ui/Repere'
import { libelleMois } from '@/lib/agences/activite'
import { contexteAgence } from '@/lib/agences/contexte'
import {
  ETAPES,
  MOTIFS_PAR_PARTIE,
  PARTIES,
  joursDepuis,
  lireBloques,
  lireMois,
  lireSynthese,
  totauxPilotage,
} from '@/lib/agences/tableau-de-bord'
import { statuts as statutsEn } from '@/lib/content/en/espace'
import { tableauDeBord as tEn } from '@/lib/content/en/tableau-de-bord'
import { statuts as statutsFr } from '@/lib/content/espace'
import { tableauDeBord as tFr } from '@/lib/content/tableau-de-bord'
import { choisir, locale } from '@/lib/i18n'
import { langueEspace, titreEspace } from '@/lib/langue-espace'

export const generateMetadata = () => titreEspace(tFr.titre, tEn.titre)

/** Le nombre de dossiers bloques affiches ; l'export les contient tous. */
const LIGNES_AFFICHEES = 50

/**
 * Le tableau de bord de pilotage de l'agence (0099).
 *
 * Tout membre y a acces : des nombres, et des references de dossiers que la
 * RLS lui montre deja. Chaque partie se lit a part : une panne n'efface pas
 * les autres et ne s'affiche jamais comme un zero.
 */
export default async function PagePilotage() {
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)
  const statuts = choisir(langue, statutsFr, statutsEn)
  const fmt = (n: number) => n.toLocaleString(locale(langue), { maximumFractionDigits: 1 })
  const delai = (n: number | null) => (n == null ? null : t.jours(fmt(n)))

  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')
  const lire = async (fonction: string) => {
    try {
      const { data, error } = await c.supabase.rpc(fonction)
      return error ? null : (data as unknown)
    } catch {
      return null
    }
  }
  const [brutSynthese, brutBloques, brutMois] = await Promise.all([
    lire('pilotage_de_mon_agence'),
    lire('dossiers_bloques_de_mon_agence'),
    lire('pilotage_mensuel_de_mon_agence'),
  ])
  const synthese = lireSynthese(brutSynthese)
  const bloques = lireBloques(brutBloques)
  const mois = lireMois(brutMois)
  const totaux = mois ? totauxPilotage(mois) : null
  const maintenant = new Date()
  const panne = (
    <p role="status" className="text-muted text-sm">
      {t.panne}
    </p>
  )

  const tuiles = [
    {
      titre: t.tuiles.enCours,
      valeur: synthese ? fmt(synthese.en_cours) : null,
      detail:
        synthese && synthese.echeances_proches > 0
          ? t.tuiles.echeances(synthese.echeances_proches)
          : null,
    },
    {
      titre: t.tuiles.bloques,
      valeur: synthese ? fmt(synthese.bloques) : null,
      detail:
        synthese && synthese.attendus.agence > 0
          ? t.tuiles.aTraiter(synthese.attendus.agence)
          : null,
    },
    {
      titre: t.tuiles.delaiComplet,
      valeur: totaux ? (delai(totaux.delaiCompletJours) ?? t.aucunDelai) : null,
      detail: totaux?.delaiCompletJours == null ? null : t.tuiles.surDouzeMois,
      texte: totaux?.delaiCompletJours == null,
    },
    {
      titre: t.tuiles.delaiSignature,
      valeur: totaux ? (delai(totaux.delaiSignatureJours) ?? t.aucunDelai) : null,
      detail: totaux?.delaiSignatureJours == null ? null : t.tuiles.surDouzeMois,
      texte: totaux?.delaiSignatureJours == null,
    },
  ]
  const plusGrand = synthese ? Math.max(1, ...ETAPES.map((e) => synthese.etapes[e])) : 1
  const totalEtapes = synthese ? ETAPES.reduce((n, e) => n + synthese.etapes[e], 0) : 0

  return (
    <div className="page-espace w-full max-w-[1080px]">
      <EnteteEspace titre={t.titre} etiquette={t.etiquette}>
        <p>{t.aide}</p>
        {synthese ? (
          <p className="mt-2 text-[13px]">
            {t.genere(
              new Date(synthese.genere_le).toLocaleString(locale(langue), {
                dateStyle: 'long',
                timeStyle: 'short',
                timeZone: 'Europe/Paris',
              }),
            )}
          </p>
        ) : null}
      </EnteteEspace>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tuiles.map((tuile) => (
          <div key={tuile.titre} className="outlined bg-paper flex flex-col rounded-xl p-4">
            <dt className="text-muted text-[11px] leading-snug font-bold tracking-wide uppercase">
              {tuile.titre}
            </dt>
            <dd className="mt-auto pt-3">
              <span
                className={
                  tuile.valeur == null || tuile.texte
                    ? 'text-muted block text-sm font-semibold'
                    : 'font-display block text-3xl tabular-nums'
                }
              >
                {tuile.valeur ?? t.indisponible}
              </span>
              {tuile.detail ? (
                <span className="text-muted mt-1 block text-[13px] leading-snug font-medium">
                  {tuile.detail}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      <section className="panneau-espace mt-8" aria-labelledby="pilotage-etapes">
        <h2 id="pilotage-etapes" className="text-xl font-bold">
          {t.etapes.titre}
        </h2>
        {!synthese ? (
          panne
        ) : totalEtapes === 0 ? (
          <p className="text-muted text-sm">{t.etapes.aucun}</p>
        ) : (
          <ul className="text-[14px]">
            {ETAPES.map((e) => {
              const nombre = synthese.etapes[e]
              const libelle = statuts[e]?.libelle ?? e
              return (
                <li
                  key={e}
                  className="border-ink/10 grid grid-cols-[9.5rem_1fr_3rem] items-center gap-3 border-b py-2.5 last:border-0 sm:grid-cols-[13rem_1fr_3.5rem]"
                >
                  <Link
                    href={`/espace?statut=${e}` as Route}
                    aria-label={t.etapes.voir(libelle)}
                    className="inline-flex min-h-[44px] items-center font-semibold underline-offset-4 hover:underline"
                  >
                    {libelle}
                  </Link>
                  <span aria-hidden className="bg-ink/8 block h-3 overflow-hidden rounded-full">
                    <span
                      className="bg-cobalt block h-full rounded-full"
                      style={{ width: `${(nombre / plusGrand) * 100}%` }}
                    />
                  </span>
                  <span className="text-right font-bold tabular-nums">{fmt(nombre)}</span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-muted mt-4 text-xs leading-relaxed">{t.etapes.aide}</p>
      </section>

      <section className="panneau-espace mt-8" aria-labelledby="pilotage-blocages">
        <h2 id="pilotage-blocages" className="text-xl font-bold">
          {t.blocages.titre}
        </h2>
        {!synthese ? (
          panne
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PARTIES.map((partie) => (
                <li key={partie} className="border-ink/15 bg-cream rounded-xl border p-4">
                  <p className="text-muted text-[11px] font-bold tracking-wide uppercase">
                    {t.blocages.attend}
                  </p>
                  <p className="mt-1 flex items-baseline justify-between gap-3 font-bold">
                    <span>{t.blocages.parties[partie]}</span>
                    <span
                      className={
                        synthese.attendus[partie] === 0
                          ? 'text-muted text-2xl font-medium tabular-nums'
                          : 'text-cobalt text-2xl tabular-nums'
                      }
                    >
                      {fmt(synthese.attendus[partie])}
                    </span>
                  </p>
                  <dl className="border-ink/10 mt-3 space-y-1.5 border-t pt-3 text-[13px]">
                    {MOTIFS_PAR_PARTIE[partie].map((motif) => (
                      <div key={motif} className="flex items-baseline justify-between gap-3">
                        <dt className="leading-snug">{t.blocages.motifs[motif]}</dt>
                        <dd
                          className={
                            synthese.blocages[motif] === 0
                              ? 'text-muted tabular-nums'
                              : 'font-bold tabular-nums'
                          }
                        >
                          {fmt(synthese.blocages[motif])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <p className="text-muted mt-4 text-xs leading-relaxed">
              {t.blocages.aide(synthese.seuils)}
            </p>
          </>
        )}

        {!bloques ? (
          synthese ? (
            <div className="mt-6">{panne}</div>
          ) : null
        ) : bloques.length === 0 ? (
          <p className="mt-6 text-sm font-semibold">{t.blocages.aucun}</p>
        ) : (
          <>
            <div
              className="ombres-defilement relative mt-6 overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label={t.blocages.legende}
            >
              <table className="w-full min-w-[640px] text-left text-[14px]">
                <thead>
                  <tr className="border-ink/15 border-b">
                    {(['reference', 'etape', 'motif', 'attend'] as const).map((k) => (
                      <th key={k} scope="col" className="py-2 pr-4 font-bold">
                        {t.blocages.colonnes[k]}
                      </th>
                    ))}
                    <th scope="col" className="py-2 text-right font-bold">
                      {t.blocages.colonnes.depuis}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bloques.slice(0, LIGNES_AFFICHEES).map((d) => (
                    <tr key={d.id} className="border-ink/10 border-b align-top last:border-0">
                      <th scope="row" className="py-2.5 pr-4 font-mono text-[13px] font-semibold">
                        <Link
                          href={`/espace/dossiers/${d.id}`}
                          className="inline-flex min-h-[44px] items-center underline underline-offset-4"
                        >
                          {d.reference}
                        </Link>
                      </th>
                      <td className="py-2.5 pr-4">{statuts[d.statut]?.libelle ?? d.statut}</td>
                      <td className="py-2.5 pr-4">
                        {t.blocages.motifs[d.motif]}
                        {d.echeance_proche ? (
                          <Repere ton="flame" className="text-muted mt-1 text-[12px]">
                            {t.blocages.echeance}
                          </Repere>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-4">{t.blocages.parties[d.attend]}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {t.blocages.depuis(joursDepuis(d.depuis, maintenant))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bloques.length > LIGNES_AFFICHEES ? (
              <p className="text-muted mt-3 text-[13px]">
                {t.blocages.limite(LIGNES_AFFICHEES, synthese?.bloques ?? bloques.length)}
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="panneau-espace mt-8" aria-labelledby="pilotage-relances">
        <h2 id="pilotage-relances" className="text-xl font-bold">
          {t.relances.titre}
        </h2>
        {!mois || !totaux ? (
          panne
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              {
                titre: t.relances.ceMois,
                garant: mois[0]?.relances_garant ?? 0,
                locataire: mois[0]?.relances_locataire ?? 0,
              },
              {
                titre: t.relances.douzeMois,
                garant: totaux.relancesGarant,
                locataire: totaux.relancesLocataire,
              },
            ].map((periode) => (
              <div key={periode.titre} className="border-ink/15 bg-cream rounded-xl border p-4">
                <dt className="text-muted text-[11px] font-bold tracking-wide uppercase">
                  {periode.titre}
                </dt>
                <dd className="mt-2 grid grid-cols-2 gap-3">
                  {(['garant', 'locataire'] as const).map((qui) => (
                    <span key={qui} className="block">
                      <span className="font-display block text-2xl tabular-nums">
                        {fmt(periode[qui])}
                      </span>
                      <span className="text-muted block text-[13px] font-medium">
                        {t.relances[qui]}
                      </span>
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {synthese && synthese.blocages.relances_epuisees > 0 ? (
          <p className="mt-4 text-sm font-semibold">
            <Link
              href="/espace?relances_epuisees=1"
              className="inline-flex min-h-[44px] items-center underline underline-offset-4"
            >
              {t.relances.epuisees(synthese.blocages.relances_epuisees)}
            </Link>
          </p>
        ) : null}
        <p className="text-muted mt-4 text-xs leading-relaxed">{t.relances.aide}</p>
        {c.role === 'admin' ? (
          <Link href="/espace/rappels" className="lien-espace mt-4">
            {t.relances.reglage}
          </Link>
        ) : null}
      </section>

      <section className="panneau-espace mt-8" aria-labelledby="pilotage-mois">
        <h2 id="pilotage-mois" className="text-xl font-bold">
          {t.mois.titre}
        </h2>
        {!mois ? (
          panne
        ) : (
          <div
            className="ombres-defilement relative overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label={t.mois.titre}
          >
            <table className="w-full min-w-[760px] text-left text-[14px]">
              <thead>
                <tr className="border-ink/15 border-b align-bottom">
                  <th scope="col" className="py-2 pr-4 font-bold">
                    {t.mois.colonnes.mois}
                  </th>
                  {(
                    [
                      'ouverts',
                      'complets',
                      'delaiComplet',
                      'signes',
                      'delaiSignature',
                      'relancesGarant',
                      'relancesLocataire',
                    ] as const
                  ).map((k) => (
                    <th key={k} scope="col" className="py-2 pl-4 text-right font-bold">
                      {t.mois.colonnes[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mois.map((l) => (
                  <tr key={l.mois} className="border-ink/10 border-b last:border-0">
                    <th scope="row" className="py-2 pr-4 font-semibold capitalize">
                      {libelleMois(l.mois, langue)}
                    </th>
                    {[
                      fmt(l.ouverts),
                      fmt(l.complets),
                      delai(l.delai_complet_moyen_jours) ?? '-',
                      fmt(l.signes),
                      delai(l.delai_signature_moyen_jours) ?? '-',
                      fmt(l.relances_garant),
                      fmt(l.relances_locataire),
                    ].map((valeur, i) => (
                      <td key={i} className="py-2 pl-4 text-right tabular-nums">
                        {valeur}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted mt-4 text-xs leading-relaxed">{t.mois.aide}</p>
        <Link href="/espace/activite" className="lien-espace mt-4">
          {t.mois.activite}
        </Link>
      </section>

      <section className="panneau-espace mt-8" aria-labelledby="pilotage-exports">
        <h2 id="pilotage-exports" className="text-xl font-bold">
          {t.exports.titre}
        </h2>
        <p className="text-muted text-sm">{t.exports.aide}</p>
        {/* Des liens simples : chaque route rend un fichier, pas une page. */}
        <ul className="mt-4 flex flex-wrap gap-3">
          {(['synthese', 'blocages', 'mois'] as const).map((vue) => (
            <li key={vue}>
              <a href={`/espace/pilotage/export/${vue}`} download className="lien-espace">
                {t.exports[vue]}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
