import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { contexteAgence } from '@/lib/agences/contexte'
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
  const { data, error } = await c.supabase
    .from('connecteurs_agence')
    .select('id,nom,cree_le,expire_le,revoque_le,utilise_le')
    .order('revoque_le', { ascending: false, nullsFirst: true })
    .order('expire_le', { ascending: false })
    .order('id')
    .limit(100)
  if (error || !data) throw new Error('Liste des connecteurs indisponible')
  const maintenant = Date.now()
  const date = (v: string) => new Date(v).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
  return (
    <div className="w-full max-w-3xl">
      <Link href="/espace" className="underline">
        {t.retour}
      </Link>
      <h1 className="font-display mt-4 text-3xl uppercase">{t.titre}</h1>
      <p className="mt-4">{t.aide}</p>
      <p className="mt-2 text-sm">{t.limites}</p>
      <a href="/connecteurs-openapi.json" className="mt-3 inline-block underline">
        {t.documentation}
      </a>
      <FormulaireConnecteur agence={c.agence.id} />
      <ul className="mt-8 grid gap-4">
        {data.map((k) => {
          const active = !k.revoque_le && Date.parse(k.expire_le) > maintenant
          return (
            <li key={k.id} className="outlined min-w-0 rounded-xl p-4 break-words">
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
