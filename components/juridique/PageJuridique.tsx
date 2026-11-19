import { EnTetePage } from '@/components/ui/EnTetePage'
import { Section } from '@/components/ui/Section'
import { juridique } from '@/lib/content/juridique'

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
}: {
  titre: string
  incomplet: boolean
  children: React.ReactNode
}) {
  return (
    <main {...(incomplet ? { 'data-editeur-incomplet': '' } : {})}>
      <EnTetePage titre={titre} sousTitre={<p className="text-sm">{juridique.miseAJour}</p>} />
      <Section className="bg-cream py-16 md:py-24" innerClassName="max-w-[760px]">
        {incomplet ? (
          <p role="note" className="bg-sun rounded-brut-lg mb-10 px-5 py-4 text-sm font-semibold">
            {juridique.avertissementIncomplet}
          </p>
        ) : null}
        <div className="space-y-12 text-base leading-relaxed">{children}</div>
      </Section>
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
      <h2 className="font-display text-cobalt text-2xl md:text-3xl">{titre}</h2>
      <div className="mt-3 space-y-3">
        {paragraphes?.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {children}
      </div>
    </section>
  )
}

/** Une valeur de l'editeur, ou la mention visible qu'elle manque. */
export function Valeur({ valeur }: { valeur: string | null }) {
  return valeur ? <>{valeur}</> : <em className="text-muted">{juridique.aCompleter}</em>
}
