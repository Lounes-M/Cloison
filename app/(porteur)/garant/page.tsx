import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'

export const metadata: Metadata = {
  title: 'Ton dépôt',
  robots: { index: false, follow: false },
}

/**
 * L'espace du garant, reduit a ce qu'il faut pour prouver que son lien
 * l'amene bien ici et que son jeton lui ouvre son dossier.
 *
 * Le depot des pieces est la tache 29 : c'est la que se joue l'essentiel de
 * l'abandon, et il merite sa propre livraison plutot qu'un coin de celle-ci.
 */
export default async function PageGarant() {
  const porteur = await capaciteDepuisCookies()
  if (!porteur) redirect('/lien-invalide')
  if (porteur.capacite.partie !== 'garant') redirect('/locataire')

  const { data: dossier } = await clientPorteurDeLien(porteur.jeton)
    .from('dossiers')
    .select('reference, email_locataire')
    .eq('id', porteur.capacite.dossierId)
    .maybeSingle()

  if (!dossier) redirect('/lien-invalide')

  return (
    <div className="w-full max-w-[560px]">
      <p className="text-muted text-[13px] font-bold tracking-wide uppercase">
        Référence {String(dossier.reference)}
      </p>
      <h1 className="font-display mt-2 text-3xl uppercase md:text-4xl">Ton dépôt</h1>
      <p className="mt-4 text-[15px] leading-relaxed font-medium">
        <strong>{String(dossier.email_locataire)}</strong> t&apos;a désigné comme garant. Tu es au
        bon endroit, et ton lien fonctionne.
      </p>
      <div className="bg-sun outlined shadow-brut mt-8 rounded-[18px] p-6">
        <p className="font-display text-xl uppercase">Le dépôt arrive</p>
        <p className="mt-2 text-[15px] leading-relaxed font-medium">
          C&apos;est le prochain chantier. Garde ce lien : il te ramènera ici quand le dépôt sera
          ouvert.
        </p>
      </div>
    </div>
  )
}
