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
    <div className="max-w-lg">
      <h1 className="font-display text-3xl">{securite.titre}</h1>
      <p className="mt-4">{securite.aide}</p>
      <FormulaireSecurite initial={{ facteur }} />
    </div>
  )
}
