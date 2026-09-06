import { FormulaireContinuite } from '@/components/forms/FormulaireContinuite'
import type { Metadata } from 'next'

import { FormulaireOuverture } from '@/components/forms/FormulaireOuverture'
import { Section } from '@/components/ui/Section'
import { pilote } from '@/lib/content/pilote'
import { porte } from '@/lib/content/locataire'

export const metadata: Metadata = {
  title: 'Créer mon dossier',
  description: porte.sousTitre,
}

/**
 * La porte principale du produit.
 *
 * Dans le groupe marketing, avec son en-tete et son pied de page : la personne
 * arrive depuis la page d'accueil et n'a pas encore quitte le site public. Le
 * depouillement commence apres, une fois le lien clique.
 */
export default function PageDemarrer() {
  return (
    <Section className="py-16 md:py-24" innerClassName="max-w-[520px]">
      <h1 className="font-display text-3xl uppercase md:text-5xl">{porte.titre}</h1>
      <p className="text-muted mt-4 mb-10 text-[16px] leading-relaxed font-medium">
        {porte.sousTitre}
      </p>

      <p className="border-ink bg-sun mb-8 rounded-xl border-2 p-4 text-sm leading-relaxed">
        {pilote.avantOuverture}
      </p>
      <FormulaireOuverture />
      <FormulaireContinuite mode="retrouver" />
    </Section>
  )
}
