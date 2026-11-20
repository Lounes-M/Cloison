import { connection } from 'next/server'

import { CadreEspace } from '@/components/layout/CadreEspace'
import { quitterMonDossier } from '@/lib/acces/action-porteur'
import { sessionPorteur as sessionPorteurFr } from '@/lib/content/session-porteur'
import { sessionPorteur as sessionPorteurEn } from '@/lib/content/en/session-porteur'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

/**
 * L'espace des porteurs de lien : le locataire et le garant.
 *
 * Une identite partagee avec l'agence, sans partager sa navigation ni sa session.
 * Le cadre ne decide jamais du role : chaque page conserve ses controles serveur.
 */
export default async function LayoutPorteur({ children }: { children: React.ReactNode }) {
  const langue = await langueEspace()
  const sessionPorteur = choisir(langue, sessionPorteurFr, sessionPorteurEn)

  // Rendu a chaque requete, jamais prerendu : la Content-Security-Policy de
  // l'applicatif porte un nonce que le proxy tire par requete, et une
  // page prerendue au build ne pourrait pas le porter. Ses scripts seraient
  // alors refuses par le navigateur, sans bruit.
  await connection()

  return (
    <CadreEspace
      sortie={
        <form action={quitterMonDossier}>
          <button type="submit" className="lien-espace">
            {sessionPorteur.quitter}
          </button>
        </form>
      }
    >
      {children}
    </CadreEspace>
  )
}
