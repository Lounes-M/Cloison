import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { RepereParcours } from '@/components/layout/RepereParcours'
import { interfaceEspace } from '@/lib/content/interface'
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
    <Section className="espace-shell bg-cream py-12 md:py-20" innerClassName="max-w-[1040px]">
      <div className="grid items-start gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
        <div className="min-w-0">
          <EnteteEspace titre={porte.titre} etiquette={interfaceEspace.ouverture}>
            <p>{porte.sousTitre}</p>
          </EnteteEspace>
          <div className="panneau-espace">
            <p className="border-ink bg-sun mb-8 rounded-xl border-2 p-4 text-sm leading-relaxed">
              {pilote.avantOuverture}
            </p>
            <FormulaireOuverture />
            <FormulaireContinuite mode="retrouver" />
          </div>
        </div>
        <RepereParcours />
      </div>
    </Section>
  )
}
