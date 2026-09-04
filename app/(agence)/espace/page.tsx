import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { FormulaireActivation } from '@/components/forms/FormulaireActivation'
import { FormulaireNomAgence } from '@/components/forms/FormulaireNomAgence'
import { FormulaireNouveauDossier } from '@/components/forms/FormulaireNouveauDossier'
import { FormulaireSeuil } from '@/components/forms/FormulaireSeuil'
import { ouvrirMaDemonstration } from '@/lib/agences/action-demonstration'
import { contexteAgence } from '@/lib/agences/contexte'
import { activation, statuts, tableau } from '@/lib/content/espace'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Espace agence',
  robots: { index: false, follow: false },
}

const tons = {
  sky: 'bg-sky',
  sun: 'bg-sun',
  mint: 'bg-mint',
  flame: 'bg-flame text-white',
  paper: 'bg-paper',
} as const

type Ligne = {
  id: string
  reference: string
  email_locataire: string
  statut: string
  cree_le: string
  demonstration: boolean
  engagements: { ratio: string | null } | { ratio: string | null }[] | null
}

function ratioDe(ligne: Ligne): string | null {
  const e = Array.isArray(ligne.engagements) ? ligne.engagements[0] : ligne.engagements
  return e?.ratio == null
    ? null
    : Number(e.ratio).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
}

/**
 * L'espace agence : ses dossiers, et de quoi en ouvrir un.
 *
 * Le rattachement est rejoue a chaque visite, ce que la fonction supporte :
 * elle est idempotente et rend l'agence deja rattachee. Cela evite un etat
 * « compte cree mais pas rattache » qu'il faudrait rattraper autrement.
 */
export default async function PageEspace() {
  const contexte = await contexteAgence()
  if (contexte.etat === 'anonyme') redirect('/connexion')

  if (contexte.etat === 'non-rattache') {
    const { rattachement, email } = contexte

    if (rattachement.etat === 'nom-requis') {
      return (
        <div className="w-full max-w-[440px]">
          <h1 className="font-display text-3xl uppercase md:text-4xl">Encore une chose</h1>
          <p className="text-muted mt-3 mb-8 text-[15px] leading-relaxed font-medium">
            Ton adresse est vérifiée. Il ne manque que le nom sous lequel ton agence apparaîtra.
          </p>
          <FormulaireNomAgence domaine={email.split('@')[1] ?? 'ton domaine'} />
        </div>
      )
    }

    if (rattachement.etat === 'refus') {
      return (
        <div className="w-full max-w-[440px] text-center">
          <h1 className="font-display text-3xl uppercase">Pas cette adresse</h1>
          <p className="mt-4 text-[15px] leading-relaxed font-medium">{rattachement.message}</p>
          <p className="text-muted mt-4 text-[14px] font-medium">
            Le rattachement se fait par le domaine de ton adresse : c&apos;est lui qui te relie à
            tes collègues, et une adresse personnelle ne relie à personne.
          </p>
        </div>
      )
    }

    return (
      <div className="w-full max-w-[440px] text-center">
        <h1 className="font-display text-3xl uppercase">Ça n&apos;a pas marché</h1>
        <p className="text-muted mt-4 text-[15px] font-medium">
          Réessaie dans un instant. Si ça persiste, écris-nous.
        </p>
      </div>
    )
  }

  const { agence, role, supabase, email } = contexte
  const verifiee = agence.statut === 'verifiee'

  const { data } = await supabase
    .from('dossiers')
    .select('id, reference, email_locataire, statut, cree_le, demonstration, engagements(ratio)')
    .order('cree_le', { ascending: false })
  const lignes = (data ?? []) as Ligne[]

  const seuil = agence.seuilRatio.toLocaleString('fr-FR', { minimumFractionDigits: 2 })

  return (
    <div className="w-full max-w-[880px] self-start">
      <h1 className="font-display text-3xl uppercase md:text-4xl">{agence.nom}</h1>
      <p className="text-muted mt-2 text-[14px] font-medium">
        Connecté en tant que <strong className="text-ink">{email}</strong>
        {role === 'admin' ? ', administrateur' : ''}.
      </p>

      {!verifiee ? (
        <div className="bg-sun outlined shadow-brut mt-8 rounded-[18px] p-6">
          <p className="font-display text-xl uppercase">{tableau.nonVerifieeTitre}</p>
          <p className="mt-3 text-[15px] leading-relaxed font-medium">{tableau.nonVerifieeTexte}</p>

          <div className="border-ink mt-6 border-t-2 pt-6">
            <p className="font-display text-lg uppercase">{activation.titre}</p>
            <p className="mt-2 mb-5 text-[14px] leading-relaxed font-medium">{activation.texte}</p>
            {agence.activationDemandeeLe ? (
              <p className="bg-paper outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
                {activation.enAttente(
                  new Date(agence.activationDemandeeLe).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                  }),
                )}
              </p>
            ) : role === 'admin' ? (
              <FormulaireActivation siren={agence.siren ?? ''} cartePro={agence.cartePro ?? ''} />
            ) : (
              <p className="text-[14px] font-medium">{activation.membre}</p>
            )}
          </div>
        </div>
      ) : null}

      <section className="mt-12">
        <h2 className="font-display text-2xl uppercase">{tableau.dossiers}</h2>

        {lignes.length === 0 ? (
          <p className="text-muted mt-4 text-[15px] font-medium">{tableau.aucun}</p>
        ) : (
          <div className="outlined mt-6 overflow-x-auto rounded-[14px]">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-paper border-ink border-b-2 text-[12px] font-bold tracking-wide uppercase">
                <tr>
                  <th className="px-4 py-3">{tableau.colonnes.reference}</th>
                  <th className="px-4 py-3">{tableau.colonnes.locataire}</th>
                  <th className="px-4 py-3">{tableau.colonnes.statut}</th>
                  <th className="px-4 py-3">{tableau.colonnes.ratio}</th>
                  <th className="px-4 py-3">{tableau.colonnes.ouvert}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => {
                  const statut = statuts[ligne.statut] ?? statuts.ouvert!
                  const ratio = ratioDe(ligne)
                  return (
                    <tr key={ligne.id} className="border-ink/20 border-b last:border-0">
                      <td className="px-4 py-3 font-bold">
                        <Link
                          href={`/espace/dossiers/${ligne.id}`}
                          className="hover:text-cobalt underline-offset-2 hover:underline"
                        >
                          {ligne.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {ligne.email_locataire}
                        {ligne.demonstration ? (
                          <span className="text-muted ml-2 text-[11px] font-bold tracking-wide uppercase">
                            {tableau.demonstration}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'border-ink inline-block rounded-full border-2 px-3 py-1 text-[12px] font-bold',
                            tons[statut.ton],
                          )}
                        >
                          {statut.libelle}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">{ratio ? `${ratio}×` : '·'}</td>
                      <td className="text-muted px-4 py-3 font-medium">
                        {new Date(ligne.cree_le).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-12 grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl uppercase">{tableau.nouveau}</h2>
          <div className="mt-6">
            <FormulaireNouveauDossier verifiee={verifiee} />
          </div>

          <div className="bg-sky outlined shadow-brut mt-10 rounded-[18px] p-6">
            <p className="font-display text-lg uppercase">{tableau.demoTitre}</p>
            <p className="mt-2 text-[14px] leading-relaxed font-medium">{tableau.demoAide}</p>
            {/* Une action serveur sans etat : elle se termine toujours par une
                redirection, vers le dossier de demonstration ou vers l'espace. */}
            <form action={ouvrirMaDemonstration} className="mt-4">
              <button
                type="submit"
                className="press outlined bg-paper shadow-brut-xs cursor-pointer rounded-[10px] px-5 py-3 text-[14px] font-bold"
              >
                {tableau.demoBouton}
              </button>
            </form>
          </div>
        </div>

        <div>
          <h2 className="font-display text-2xl uppercase">{tableau.seuilTitre}</h2>
          <p className="text-muted mt-2 mb-6 text-[13px] leading-relaxed font-medium">
            {tableau.seuilAide}
          </p>
          {role === 'admin' ? (
            <FormulaireSeuil seuilActuel={seuil} />
          ) : (
            <p className="text-[14px] font-medium">{tableau.seuilLecture(seuil)}</p>
          )}
        </div>
      </section>
    </div>
  )
}
