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
    <div className="w-full max-w-[440px]">
      <h1 className="font-display text-3xl uppercase md:text-4xl">Ton espace agence</h1>
      <p className="text-muted mt-3 mb-8 text-[15px] leading-relaxed font-medium">
        Pas de mot de passe. On t&apos;envoie un lien, tu cliques, tu es dedans.
      </p>

      <FormulaireConnexion lienExpire={echec === 'lien'} />
    </div>
  )
}
