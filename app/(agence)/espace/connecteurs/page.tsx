import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { interfaceEspace } from '@/lib/content/interface'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { contexteAgence } from '@/lib/agences/contexte'
import { listerConnecteurs } from '@/lib/connecteurs/liste'
import { connecteurs as t } from '@/lib/content/connecteurs'
import { FormulaireConnecteur } from '@/components/forms/FormulaireConnecteur'
export const metadata: Metadata = {
  title: t.titre,
  robots: { index: false, follow: false },
}
export default async function PageConnecteurs() {
  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')
  if (c.role !== 'admin') notFound()
  const data = await listerConnecteurs(c)
  const date = (v: string) => new Date(v).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
  return (
    <div className="page-espace w-full max-w-[960px]">
      <Link href="/espace" className="lien-espace mb-6">
        {t.retour}
      </Link>
      <EnteteEspace titre={t.titre} etiquette={interfaceEspace.connecteurs}>
        <p>{t.aide}</p>
        <p className="mt-2 text-sm">{t.limites}</p>
        <a href="/connecteurs-openapi.json" className="lien-espace mt-5">
          {t.documentation}
        </a>
      </EnteteEspace>
      <div className="panneau-espace">
        <FormulaireConnecteur agence={c.agence.id} />
      </div>
      <ul className="mt-8 grid gap-4">
        {data.map((k) => {
          const active = k.active
          return (
            <li
              key={k.id}
              className="outlined bg-paper shadow-brut-sm rounded-brut min-w-0 p-5 break-words"
            >
              <h2 className="font-bold">{k.nom}</h2>
              <p>{k.revoque_le ? t.revoque : active ? t.actif : t.expire}</p>
              <p className="text-sm">
                {t.expiration} : {date(k.expire_le)}
              </p>
              <p className="text-sm">
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
