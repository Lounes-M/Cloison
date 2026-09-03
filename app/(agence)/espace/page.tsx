import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { FormulaireNomAgence } from '@/components/forms/FormulaireNomAgence'
import { clientAgence, utilisateurCourant } from '@/lib/acces/agence'
import { rattacher } from '@/lib/agences/rattachement'

export const metadata: Metadata = {
  title: 'Espace agence',
  robots: { index: false, follow: false },
}

/**
 * L'espace agence, reduit pour l'instant a ce qu'il faut pour prouver que
 * l'authentification tient de bout en bout.
 *
 * Trois etats possibles, et le rattachement les decide seul :
 *
 *   - pas de session : retour a la connexion ;
 *   - session, mais domaine sans espace : on demande le nom de l'agence ;
 *   - session et agence : l'espace.
 *
 * Le rattachement est rejoue a chaque visite, ce que la fonction supporte : elle
 * est idempotente et rend l'agence deja rattachee. Cela evite un etat « compte
 * cree mais pas rattache » qu'il faudrait rattraper autrement.
 */
export default async function PageEspace() {
  const utilisateur = await utilisateurCourant()
  if (!utilisateur) redirect('/connexion')

  const rattachement = await rattacher()

  if (rattachement.etat === 'nom-requis') {
    const domaine = utilisateur.email?.split('@')[1] ?? 'ton domaine'
    return (
      <div className="w-full max-w-[440px]">
        <h1 className="font-display text-3xl uppercase md:text-4xl">Encore une chose</h1>
        <p className="text-muted mt-3 mb-8 text-[15px] leading-relaxed font-medium">
          Ton adresse est vérifiée. Il ne manque que le nom sous lequel ton agence apparaîtra.
        </p>
        <FormulaireNomAgence domaine={domaine} />
      </div>
    )
  }

  if (rattachement.etat === 'refus') {
    return (
      <div className="w-full max-w-[440px] text-center">
        <h1 className="font-display text-3xl uppercase">Pas cette adresse</h1>
        <p className="mt-4 text-[15px] leading-relaxed font-medium">{rattachement.message}</p>
        <p className="text-muted mt-4 text-[14px] font-medium">
          Le rattachement se fait par le domaine de ton adresse : c&apos;est lui qui te relie à tes
          collègues, et une adresse personnelle ne relie à personne.
        </p>
      </div>
    )
  }

  if (rattachement.etat === 'panne') {
    return (
      <div className="w-full max-w-[440px] text-center">
        <h1 className="font-display text-3xl uppercase">Ça n&apos;a pas marché</h1>
        <p className="text-muted mt-4 text-[15px] font-medium">
          Réessaie dans un instant. Si ça persiste, écris-nous.
        </p>
      </div>
    )
  }

  const supabase = await clientAgence()
  const { data: agence } = await supabase
    .from('agences')
    .select('nom, domaine, statut')
    .eq('id', rattachement.agenceId)
    .maybeSingle()

  return (
    <div className="w-full max-w-[560px]">
      <h1 className="font-display text-3xl uppercase md:text-4xl">{agence?.nom ?? 'Ton agence'}</h1>
      <p className="text-muted mt-3 text-[15px] font-medium">
        Connecté en tant que <strong className="text-ink">{utilisateur.email}</strong>.
      </p>

      {agence?.statut !== 'verifiee' ? (
        <div className="bg-sun outlined shadow-brut mt-8 rounded-[18px] p-6">
          <p className="font-display text-xl uppercase">Espace non vérifié</p>
          <p className="mt-3 text-[15px] leading-relaxed font-medium">
            Tu as accès au produit entier sur un dossier de démonstration. L&apos;envoi d&apos;un
            lien à un vrai garant attend la vérification de ton SIREN et de ta carte
            professionnelle.
          </p>
        </div>
      ) : null}

      <p className="text-muted mt-8 text-[14px] font-medium">
        Les dossiers arrivent au prochain chantier. Cet écran ne sert pour l&apos;instant qu&apos;à
        établir que la session, le rattachement par domaine et les politiques d&apos;accès
        fonctionnent ensemble.
      </p>
    </div>
  )
}
