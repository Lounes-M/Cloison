import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { FormulaireGarant } from '@/components/forms/FormulaireGarant'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { espace, statuts } from '@/lib/content/locataire'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Ton dossier',
  robots: { index: false, follow: false },
}

const tons = {
  sky: 'bg-sky',
  sun: 'bg-sun',
  mint: 'bg-mint',
  flame: 'bg-flame text-white',
  paper: 'bg-paper',
} as const

/**
 * L'espace du locataire.
 *
 * Il voit ou en est son dossier, et rien d'autre. Ce n'est pas cette page qui
 * le garantit : c'est la base, qui ne lui rend ni ligne d'`engagements` ni
 * ligne de `pieces`, quelle que soit la requete. Cette page se contente de ne
 * pas les demander, et d'afficher un statut dont aucune valeur ne laisse
 * deduire un montant.
 */
export default async function PageLocataire() {
  const porteur = await capaciteDepuisCookies()
  if (!porteur) redirect('/lien-invalide')
  if (porteur.capacite.partie !== 'locataire') redirect('/garant')

  const supabase = clientPorteurDeLien(porteur.jeton)
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('reference, statut, email_garant, expire_le')
    .eq('id', porteur.capacite.dossierId)
    .maybeSingle()

  // Un jeton valide sans dossier lisible : le dossier a ete efface. Le lien est
  // donc perime, meme si sa signature tient encore.
  if (!dossier) redirect('/lien-invalide')

  const statut = statuts[String(dossier.statut)] ?? statuts.ouvert!
  const garant = dossier.email_garant ? String(dossier.email_garant) : null
  const expire = new Date(String(dossier.expire_le)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="w-full max-w-[560px]">
      <p className="text-muted text-[13px] font-bold tracking-wide uppercase">
        {espace.reference} {String(dossier.reference)}
      </p>
      <h1 className="font-display mt-2 text-3xl uppercase md:text-4xl">{espace.titre}</h1>

      <div className={cn('outlined shadow-brut mt-8 rounded-[18px] p-6', tons[statut.ton])}>
        <p className="font-display text-xl uppercase">{statut.libelle}</p>
        <p className="mt-2 text-[15px] leading-relaxed font-medium">{statut.explication}</p>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl uppercase">{espace.garantTitre}</h2>
        <p className="text-muted mt-2 mb-6 text-[14px] leading-relaxed font-medium">
          {garant ? espace.garantDesigne(garant) : espace.garantAucun}
        </p>
        <FormulaireGarant garantActuel={garant} />
      </section>

      <p className="text-muted mt-10 text-[13px] font-medium">{espace.expire(expire)}</p>
    </div>
  )
}
