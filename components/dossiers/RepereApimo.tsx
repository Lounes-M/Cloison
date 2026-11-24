import Link from 'next/link'

import type { ContexteAgence } from '@/lib/agences/contexte'
import { apimoActif } from '@/lib/connecteurs/apimo/configuration'
import { connexionApimo, lienApimoDuDossier } from '@/lib/connecteurs/apimo/etat'
import { apimo as tFr } from '@/lib/content/apimo'
import { apimo as tEn } from '@/lib/content/en/apimo'
import { choisir, locale } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

type Rattache = Extract<ContexteAgence, { etat: 'rattache' }>

/**
 * Ce que l'espace agence montre du connecteur Apimo. Sans connecteur ouvert,
 * sans connexion ou sans lien, ces composants ne rendent rien : une panne de
 * lecture ne bloque jamais la page qui les porte.
 */

/** Sur la fiche d'un dossier : d'ou il vient, et le dernier etat inscrit. */
export async function LienApimoDuDossier({
  contexte,
  dossier,
}: {
  contexte: Rattache
  dossier: string
}) {
  if (!apimoActif()) return null
  const lien = await lienApimoDuDossier(contexte, dossier).catch(() => null)
  if (!lien) return null
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn).dossier
  const etat =
    lien.etatEnvoye && Object.hasOwn(t.etats, lien.etatEnvoye)
      ? t.etats[lien.etatEnvoye as keyof typeof t.etats]
      : null
  return (
    <section className="panneau-espace mt-4 break-words">
      <h2 className="text-lg font-bold">{t.titre}</h2>
      <p className="mt-2 font-medium">
        {t.bien(lien.bien)}
        {lien.bail ? `, ${t.bail(lien.bail)}` : ''}
      </p>
      <p className="text-muted mt-1 text-[13px] font-medium">
        {etat && lien.envoyeLe
          ? t.envoye(
              etat,
              new Date(lien.envoyeLe).toLocaleDateString(locale(langue), {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'Europe/Paris',
              }),
            )
          : t.pasEnvoye}
      </p>
    </section>
  )
}

/** Sur le tableau des dossiers : le raccourci, pour une agence connectee. */
export async function RaccourciApimo({ contexte }: { contexte: Rattache }) {
  if (!apimoActif()) return null
  const connexion = await connexionApimo(contexte).catch(() => null)
  if (!connexion) return null
  const t = choisir(await langueEspace(), tFr, tEn).ouverture
  return (
    <Link href="/espace/apimo" className="lien-espace mt-6">
      {t.lien}
    </Link>
  )
}
