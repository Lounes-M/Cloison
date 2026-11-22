import { Repere } from '@/components/ui/Repere'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { NavigationReglages } from '@/components/layout/NavigationReglages'
import { interfaceEspace as interfaceEspaceFr } from '@/lib/content/interface'
import { notFound, redirect } from 'next/navigation'
import { contexteAgence } from '@/lib/agences/contexte'
import { listerConnecteurs } from '@/lib/connecteurs/liste'
import { connecteurs as tFr } from '@/lib/content/connecteurs'
import { FormulaireConnecteur } from '@/components/forms/FormulaireConnecteur'
import { interfaceEspace as interfaceEspaceEn } from '@/lib/content/en/interface'
import { connecteurs as tEn } from '@/lib/content/en/connecteurs'
import { choisir, locale, deuxPoints } from '@/lib/i18n'
import { langueEspace, titreEspace } from '@/lib/langue-espace'
export const generateMetadata = () => titreEspace(tFr.titre, tEn.titre)
export default async function PageConnecteurs() {
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)
  const interfaceEspace = choisir(langue, interfaceEspaceFr, interfaceEspaceEn)

  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')
  if (c.role !== 'admin') notFound()
  const data = await listerConnecteurs(c)
  const date = (v: string) =>
    new Date(v).toLocaleDateString(locale(langue), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Paris',
    })
  return (
    <div className="page-espace w-full max-w-[880px]">
      <EnteteEspace titre={t.titre} etiquette={interfaceEspace.connecteurs}>
        <p>{t.aide}</p>
        <p className="mt-2 text-sm">{t.limites}</p>
        <a href="/connecteurs-openapi.json" className="lien-espace mt-5">
          {t.documentation}
        </a>
      </EnteteEspace>
      <NavigationReglages courant="/espace/connecteurs" administration />
      <div className="panneau-espace">
        <FormulaireConnecteur agence={c.agence.id} />
      </div>
      <ul className="mt-8 grid gap-4">
        {data.map((k) => {
          const active = k.active
          return (
            <li key={k.id} className="panneau-espace break-words">
              <h2 className="text-xl font-bold">{k.nom}</h2>
              <Repere ton={active ? 'mint' : 'paper'} className="text-[15px]">
                {k.revoque_le ? t.revoque : active ? t.actif : t.expire}
              </Repere>
              <p className="text-muted mt-2 text-sm font-medium">
                {t.expiration}
                {deuxPoints(langue)}
                {date(k.expire_le)}
              </p>
              <p className="text-muted text-sm font-medium">
                {t.utilisation} : {k.utilise_le ? date(k.utilise_le) : t.jamais}
              </p>
              {active ? <FormulaireConnecteur agence={c.agence.id} id={k.id} /> : null}
            </li>
          )
        })}
      </ul>
      {!data.length ? <p className="mt-4">{t.aucun}</p> : null}
    </div>
  )
}
