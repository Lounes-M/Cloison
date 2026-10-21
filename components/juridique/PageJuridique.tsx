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
      <Section className="bg-cream py-12 md:py-16" innerClassName="max-w-[760px]">
        <h1 className="font-display text-3xl break-words uppercase sm:text-4xl md:text-5xl">{titre}</h1>
        <p className="text-muted mt-3 text-sm font-medium">{juridique.miseAJour}</p>
        {incomplet ? (
          <p
            role="note"
            className="bg-sun outlined mt-6 rounded-xl px-4 py-3 text-sm font-semibold"
          >
            {juridique.avertissementIncomplet}
          </p>
        ) : null}
        <div className="mt-8 space-y-10 text-[15px] leading-relaxed">{children}</div>
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
      <h2 className="font-display text-2xl uppercase">{titre}</h2>
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
