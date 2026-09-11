import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { interfaceEspace } from '@/lib/content/interface'
import { redirect } from 'next/navigation'
import { clientAgence, utilisateurCourant } from '@/lib/acces/agence'
import { FormulaireSecurite } from '@/components/forms/FormulaireSecurite'
import { securite } from '@/lib/content/securite'
export default async function PageSecurite() {
  if (!(await utilisateurCourant())) redirect('/connexion')
  const db = await clientAgence()
  const assurance = await db.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => null)
  if (!assurance?.error && assurance?.data?.currentLevel === 'aal2') redirect('/espace')
  const liste =
    !assurance?.error && assurance?.data?.currentLevel === 'aal1'
      ? await db.auth.mfa.listFactors().catch(() => null)
      : null
  const disponible = Boolean(liste?.data && !liste.error)
  const facteurs = (liste?.data?.totp ?? [])
    .filter((f) => f.status === 'verified')
    .map((f, i) => ({ id: f.id, nom: securite.nomFacteur(i + 1, f.friendly_name) }))
  const facteur = facteurs[0]?.id
  return (
    <div className="w-full max-w-[600px]">
      <EnteteEspace titre={securite.titre} etiquette={interfaceEspace.securite}>
        <p>{facteur ? securite.aideConnexion : securite.aide}</p>
      </EnteteEspace>
      <div className="panneau-espace">
        {disponible ? (
          <FormulaireSecurite initial={{ facteur }} facteurs={facteurs} />
        ) : (
          <div className="flex flex-col gap-4">
            <p role="alert">{securite.indisponible}</p>
            <a href="/connexion/securite" className="lien-espace">
              {securite.reessayer}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
