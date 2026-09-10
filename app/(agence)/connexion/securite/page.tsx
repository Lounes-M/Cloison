import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { interfaceEspace } from '@/lib/content/interface'
import { redirect } from 'next/navigation'
import { clientAgence, utilisateurCourant } from '@/lib/acces/agence'
import { FormulaireSecurite } from '@/components/forms/FormulaireSecurite'
import { securite } from '@/lib/content/securite'
export default async function PageSecurite() {
  if (!(await utilisateurCourant())) redirect('/connexion')
  const db = await clientAgence()
  const { data: niveau } = await db.auth.mfa.getAuthenticatorAssuranceLevel()
  if (niveau?.currentLevel === 'aal2') redirect('/espace')
  const { data } = await db.auth.mfa.listFactors()
  const facteur = data?.totp.find((f) => f.status === 'verified')?.id
  return (
    <div className="w-full max-w-[600px]">
      <EnteteEspace titre={securite.titre} etiquette={interfaceEspace.securite}>
        <p>{securite.aide}</p>
      </EnteteEspace>
      <div className="panneau-espace">
        <FormulaireSecurite initial={{ facteur }} />
      </div>
    </div>
  )
}
