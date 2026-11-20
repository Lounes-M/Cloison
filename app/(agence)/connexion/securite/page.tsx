import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { interfaceEspace as interfaceEspaceFr } from '@/lib/content/interface'
import { redirect } from 'next/navigation'
import { clientAgence, utilisateurCourant } from '@/lib/acces/agence'
import { FormulaireSecurite } from '@/components/forms/FormulaireSecurite'
import { securite as securiteFr } from '@/lib/content/securite'
import { interfaceEspace as interfaceEspaceEn } from '@/lib/content/en/interface'
import { securite as securiteEn } from '@/lib/content/en/securite'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'
export default async function PageSecurite() {
  const langue = await langueEspace()
  const securite = choisir(langue, securiteFr, securiteEn)
  const interfaceEspace = choisir(langue, interfaceEspaceFr, interfaceEspaceEn)

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
      {disponible && !facteur ? (
        <details className="panneau-espace mb-6">
          <summary className="cursor-pointer font-bold">{securite.guide.titre}</summary>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
            {securite.guide.etapes.map((etape) => (
              <li key={etape}>{etape}</li>
            ))}
          </ol>
          <p className="mt-4 text-sm">{securite.guide.secours}</p>
        </details>
      ) : null}
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
      {facteur ? <p className="mt-6 text-sm">{securite.perte}</p> : null}
    </div>
  )
}
