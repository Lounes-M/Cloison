import { EnTetePage } from '@/components/ui/EnTetePage'
import { juridique as juridiqueEn } from '@/lib/content/en/juridique'
import { juridique as juridiqueFr } from '@/lib/content/juridique'
import { choisir, type Langue } from '@/lib/i18n'

/**
 * Le gabarit commun des pages juridiques : un titre, une date, des sections.
 *
 * `incomplet` pose l'attribut que le controle de production refuse, et affiche
 * l'avertissement au lecteur. Les deux vont ensemble : une page qui dirait
 * « a completer » sans que la supervision le voie resterait ainsi des mois.
 */
export function PageJuridique({
  titre,
  incomplet,
  children,
  langue = 'fr',
}: {
  titre: string
  incomplet: boolean
  children: React.ReactNode
  langue?: Langue
}) {
  const juridique = choisir(langue, juridiqueFr, juridiqueEn)
  return (
    <main {...(incomplet ? { 'data-editeur-incomplet': '' } : {})}>
      <EnTetePage titre={titre} sousTitre={<p>{juridique.miseAJour}</p>} />
      <section className="bg-cream gouttiere pt-[6.8rem] pb-[11.25rem] max-[767px]:py-[3.75rem]">
        <div className="bg-paper mx-auto max-w-[56rem] rounded-[1.5rem] p-[2.5rem] max-[479px]:p-5">
          {incomplet ? (
            <p
              role="note"
              className="bg-sun texte-16 mb-[2.5rem] rounded-[1rem] px-5 py-4 font-semibold"
            >
              {juridique.avertissementIncomplet}
            </p>
          ) : null}
          {langue === 'en' ? (
            <p role="note" className="texte-16 text-muted mb-[2.5rem]">
              {juridiqueEn.traduction}
            </p>
          ) : null}
          <div className="space-y-[2.5rem]">{children}</div>
        </div>
      </section>
    </main>
  )
}

export function SectionJuridique({
  titre,
  paragraphes,
  children,
}: {
  titre: string
  paragraphes?: readonly string[]
  children?: React.ReactNode
}) {
  return (
    <section>
      <h2 className="texte-28 text-cobalt">{titre}</h2>
      <div className="mt-[0.75rem] space-y-[0.75rem]">
        {paragraphes?.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {children}
      </div>
    </section>
  )
}

/** Une valeur de l'editeur, ou la mention visible qu'elle manque. */
export function Valeur({ valeur, langue = 'fr' }: { valeur: string | null; langue?: Langue }) {
  const juridique = choisir(langue, juridiqueFr, juridiqueEn)
  return valeur ? <>{valeur}</> : <em className="text-muted">{juridique.aCompleter}</em>
}
