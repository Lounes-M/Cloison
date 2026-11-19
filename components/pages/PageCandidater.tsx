import type { Metadata } from 'next'
import { cache } from 'react'

import { FormulaireOuverture } from '@/components/forms/FormulaireOuverture'
import { Button } from '@/components/ui/Button'
import { EnTetePage } from '@/components/ui/EnTetePage'
import { clientServeur } from '@/lib/acces/serveur'
import { candidature as candidatureFr } from '@/lib/content/candidature'
import { candidature as candidatureEn } from '@/lib/content/en/candidature'
import { euros as eurosEn } from '@/lib/content/en/tarifs'
import { euros as eurosFr } from '@/lib/content/tarifs'
import { choisir, lien, type Langue } from '@/lib/i18n'

type Logement = {
  libelle: string
  loyer_cents: number | null
  agence: string
  ville?: string | null
  surface_m2?: number | null
  pieces?: number | null
  meuble?: boolean | null
  disponible_le?: string | null
}

/** Les faits que l'agence a renseignes (0072), dans l'ordre d'une annonce. */
function details(l: Logement, langue: Langue): { terme: string; valeur: string }[] {
  const t = choisir(langue, candidatureFr, candidatureEn)
  const lignes: { terme: string; valeur: string }[] = []
  if (l.ville) lignes.push({ terme: t.page.ville, valeur: l.ville })
  if (l.surface_m2 != null) lignes.push({ terme: t.page.surface, valeur: `${l.surface_m2} m²` })
  if (l.pieces != null) lignes.push({ terme: t.page.pieces, valeur: String(l.pieces) })
  if (l.meuble != null)
    lignes.push({ terme: t.page.meuble, valeur: l.meuble ? t.page.meubleOui : t.page.meubleNon })
  if (l.disponible_le) {
    const date = new Date(`${l.disponible_le}T12:00:00Z`)
    lignes.push({
      terme: t.page.disponible,
      valeur:
        date.getTime() <= Date.now()
          ? t.page.disponibleDes
          : date.toLocaleDateString(langue === 'en' ? 'en-GB' : 'fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
    })
  }
  return lignes
}

const logementDuCode = cache(async (code: string): Promise<Logement | null> => {
  if (!/^[a-f0-9]{32}$/.test(code)) return null
  const { data, error } = await (await clientServeur()).rpc('logement_par_code', { le_code: code })
  if (error) {
    console.error('[candidature] logement illisible')
    return null
  }
  return (Array.isArray(data) ? (data[0] as Logement | undefined) : null) ?? null
})

/**
 * Le titre et la description de l'apercu quand le lien est partage dans une
 * annonce ou une messagerie : le bien et l'agence, ce que la page montre deja.
 */
export async function metadonneesCandidater(
  params: Promise<{ code: string }>,
  langue: Langue = 'fr',
): Promise<Metadata> {
  const t = choisir(langue, candidatureFr, candidatureEn)
  const logement = await logementDuCode((await params).code)
  const robots = { index: false, follow: false }
  if (!logement) return { title: t.page.invalideTitre, robots }
  const titre = t.page.apercuTitre(logement.libelle, logement.agence)
  const description = t.page.apercuTexte(logement.agence)
  return {
    title: titre,
    description,
    robots,
    openGraph: { title: titre, description },
    twitter: { title: titre, description },
  }
}

/**
 * La page d'un lien de candidature (migration 0070).
 *
 * Elle ne montre que ce que l'agence a choisi de publier : le libelle, le
 * loyer de reference et son nom. Un code faux, ferme ou d'une agence non
 * verifiee donne la meme page, sans dire lequel.
 */
export async function PageCandidater({
  params,
  langue = 'fr',
}: {
  params: Promise<{ code: string }>
  langue?: Langue
}) {
  const t = choisir(langue, candidatureFr, candidatureEn)
  const euros = langue === 'en' ? eurosEn : eurosFr
  const { code } = await params
  const logement = await logementDuCode(code)

  if (!logement) {
    return (
      <main>
        <EnTetePage
          surtitre={t.page.etiquette}
          titre={t.page.invalideTitre}
          sousTitre={t.page.invalideTexte}
        >
          <Button href={lien(langue, '/demarrer')} className="mt-[2rem]">
            {t.page.invalideBouton}
          </Button>
        </EnTetePage>
      </main>
    )
  }

  return (
    <main>
      <section data-premiere-section="sombre" className="passe-sous-entete bg-cobalt text-white">
        <div className="gouttiere pt-[calc(var(--entete-total)+4.5rem)] pb-[6rem] max-[767px]:pt-[calc(var(--entete-total)+1.25rem)] max-[767px]:pb-[2.5rem]">
          <div className="conteneur flex flex-col gap-[1.5rem] md:grid md:grid-cols-[1fr_32rem] md:items-start md:gap-[4rem]">
            <div>
              <p className="texte-14 flex items-center gap-[0.6rem] font-semibold uppercase">
                <span aria-hidden className="bg-flame size-[0.6rem] rounded-full" />
                {t.page.etiquette}
              </p>
              <h1 className="titre-84 mt-[1rem]">{t.page.titre}</h1>
              <p className="texte-24 mt-[1.5rem] max-[479px]:leading-[1.4]">
                {t.page.intro(logement.agence)}
              </p>
              <div className="mt-[2.5rem] border-t border-[#4e8478]">
                <p className="texte-42 text-sun py-[1.5rem]">{logement.libelle}</p>
                <dl className="grid border-t border-[#4e8478] sm:grid-cols-2">
                  {[
                    { terme: t.page.agence, valeur: logement.agence },
                    ...details(logement, langue),
                    {
                      terme: t.page.loyer,
                      valeur:
                        logement.loyer_cents == null
                          ? t.page.sansLoyer
                          : euros(Number(logement.loyer_cents)),
                    },
                  ].map((d) => (
                    <div key={d.terme} className="border-b border-[#4e8478] py-[1rem]">
                      <dt className="texte-14 opacity-80">{d.terme}</dt>
                      <dd className="texte-22 mt-[0.25rem] font-semibold">{d.valeur}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <div className="espace-shell bg-cream text-ink rounded-[1.5rem] p-[2.5rem] max-[479px]:p-5">
              <FormulaireOuverture
                candidature={{ code, agence: logement.agence }}
                langue={langue}
              />
              <details className="aide-espace mt-6">
                <summary>{t.page.dejaTitre}</summary>
                <p className="mt-3 text-[14px] leading-relaxed">{t.page.dejaTexte}</p>
                <p className="mt-3 text-[14px]">
                  {t.page.code}
                  {langue === 'en' ? ': ' : ' : '}
                  <code className="font-bold break-all">{code}</code>
                </p>
              </details>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
