import { Repere } from '@/components/ui/Repere'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { NavigationReglages } from '@/components/layout/NavigationReglages'
import { interfaceEspace as interfaceEspaceFr } from '@/lib/content/interface'
import { notFound, redirect } from 'next/navigation'
import { contexteAgence } from '@/lib/agences/contexte'
import { listerConnecteurs } from '@/lib/connecteurs/liste'
import { connecteurs as tFr } from '@/lib/content/connecteurs'
import { FormulaireConnecteur } from '@/components/forms/FormulaireConnecteur'
import { FormulaireApimo } from '@/components/forms/FormulaireApimo'
import { apimoActif, retourApimoActif } from '@/lib/connecteurs/apimo/configuration'
import { connexionApimo } from '@/lib/connecteurs/apimo/etat'
import { apimo as apimoFr } from '@/lib/content/apimo'
import { apimo as apimoEn } from '@/lib/content/en/apimo'
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
  const a = choisir(langue, apimoFr, apimoEn)
  const apimo = apimoActif()
  const connexion = apimo ? await connexionApimo(c) : null
  const retourOuvert = retourApimoActif()
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
      {apimo ? (
        <section id="apimo" className="panneau-espace mt-8 break-words">
          <h2 className="text-xl font-bold">{a.titre}</h2>
          <Repere
            ton={connexion && !connexion.echec ? 'mint' : 'paper'}
            className="mt-2 text-[15px]"
          >
            {!connexion ? a.etat.absent : connexion.echec ? a.etat.erreur : a.etat.actif}
          </Repere>
          <p className="mt-3">{a.aide}</p>
          {connexion ? (
            <>
              <p className="text-muted mt-3 text-sm font-medium">
                {a.identifiants(connexion.fournisseur, connexion.agenceApimo)}
              </p>
              <p className="text-muted text-sm font-medium">
                {connexion.verifieLe ? a.verifieLe(date(connexion.verifieLe)) : a.jamaisVerifie}
              </p>
              {connexion.echec ? (
                <p role="alert" className="message-erreur mt-3">
                  {a.echecs[connexion.echec]}
                </p>
              ) : null}
              <a href="/espace/apimo" className="lien-espace mt-4">
                {a.ouverture.lien}
              </a>
              <FormulaireApimo
                agence={c.agence.id}
                operation="retour"
                retour={connexion.retour}
                retourOuvert={retourOuvert}
              />
            </>
          ) : null}
          <h3 className="mt-8 text-lg font-bold">{a.enregistrer}</h3>
          <p className="text-muted mt-1 text-sm font-medium">{a.cles}</p>
          <FormulaireApimo
            agence={c.agence.id}
            operation="configurer"
            retour={connexion?.retour}
            retourOuvert={retourOuvert}
          />
          {connexion ? (
            <>
              <h3 className="mt-8 text-lg font-bold">{a.retirer}</h3>
              <FormulaireApimo
                agence={c.agence.id}
                operation="retirer"
                retourOuvert={retourOuvert}
              />
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
