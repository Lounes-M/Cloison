import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { RepereParcours } from '@/components/layout/RepereParcours'
import { interfaceEspace } from '@/lib/content/interface'
import type { Metadata } from 'next'

import { FormulaireConnexion } from '@/components/forms/FormulaireConnexion'

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Accede a ton espace agence Cloison.',
  // Une page de connexion n'a rien a faire dans un index de moteur : elle
  // n'apporte rien a qui la trouverait, et elle attire ce qu'on ne veut pas.
  robots: { index: false, follow: false },
}

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ echec?: string }>
}) {
  const { echec } = await searchParams

  return (
    <div className="grid w-full max-w-[1040px] items-start gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
      <div className="min-w-0">
        <EnteteEspace titre={interfaceEspace.connexionTitre} etiquette={interfaceEspace.connexion}>
          <p>{interfaceEspace.connexionTexte}</p>
        </EnteteEspace>
        <div className="panneau-espace">
          <FormulaireConnexion lienExpire={echec === 'lien'} />
        </div>
      </div>
      <RepereParcours />
    </div>
  )
}
