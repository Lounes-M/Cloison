import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import {
  FormulaireOuvertureApimo,
  type BienAffiche,
} from '@/components/forms/FormulaireOuvertureApimo'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { contexteAgence } from '@/lib/agences/contexte'
import { lireBiensDeLAgence } from '@/lib/connecteurs/apimo/acces'
import { libelleDuBien } from '@/lib/connecteurs/apimo/client'
import { apimoActif } from '@/lib/connecteurs/apimo/configuration'
import { apimo as tFr } from '@/lib/content/apimo'
import { apimo as tEn } from '@/lib/content/en/apimo'
import { euros as eurosEn } from '@/lib/content/en/tarifs'
import { euros as eurosFr } from '@/lib/content/tarifs'
import { choisir, locale } from '@/lib/i18n'
import { langueEspace, titreEspace } from '@/lib/langue-espace'

export const generateMetadata = () => titreEspace(tFr.ouverture.titre, tEn.ouverture.titre)
// Les biens se lisent chez Apimo a chaque affichage : rien n'est mis en cache.
export const dynamic = 'force-dynamic'

/** Ouvrir un dossier depuis un bien a louer de l'Apimo de l'agence (0096). */
export default async function PageOuvertureApimo() {
  if (!apimoActif()) notFound()
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)
  const euros = choisir(langue, eurosFr, eurosEn)

  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')
  const lecture = await lireBiensDeLAgence(c)

  const biens: BienAffiche[] =
    lecture.etat === 'lu'
      ? lecture.biens.map((b) => ({
          id: b.id,
          libelle: libelleDuBien(b),
          details: [
            b.reference ? t.ouverture.reference(b.reference) : null,
            b.loyerCents ? euros(b.loyerCents) : t.ouverture.sansLoyer,
            b.surface ? t.ouverture.surface(b.surface.toLocaleString(locale(langue))) : null,
            b.pieces ? t.ouverture.pieces(b.pieces) : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }))
      : []

  const tronque = lecture.etat === 'lu' && lecture.tronque

  return (
    <div className="page-espace w-full max-w-[880px]">
      <EnteteEspace titre={t.ouverture.titre} etiquette={t.etiquette}>
        <p>{t.ouverture.aide}</p>
        <Link href="/espace" className="lien-espace mt-5">
          {t.ouverture.retourEspace}
        </Link>
      </EnteteEspace>
      <section className="panneau-espace">
        {lecture.etat === 'ferme' || lecture.etat === 'absent' ? (
          <>
            <p>{t.ouverture.nonConnecte}</p>
            {c.role === 'admin' ? (
              <a href="/espace/connecteurs#apimo" className="lien-espace mt-4">
                {t.ouverture.reglages}
              </a>
            ) : null}
          </>
        ) : lecture.etat === 'limite' || lecture.etat === 'secret' ? (
          <p role="alert" className="message-erreur">
            {t.echecs[lecture.etat]}
          </p>
        ) : lecture.etat === 'echec' ? (
          <p role="alert" className="message-erreur">
            {t.echecs[lecture.code === 'incertain' ? 'indisponible' : lecture.code]}
          </p>
        ) : biens.length === 0 ? (
          <p>{t.ouverture.aucun}</p>
        ) : (
          <>
            {tronque ? <p className="message-erreur mb-5">{t.ouverture.tronque}</p> : null}
            <FormulaireOuvertureApimo biens={biens} verifiee={c.agence.statut === 'verifiee'} />
          </>
        )}
      </section>
    </div>
  )
}
