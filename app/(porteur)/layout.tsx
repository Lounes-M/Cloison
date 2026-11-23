import { cookies } from 'next/headers'
import { connection } from 'next/server'

import { CadreEspace } from '@/components/layout/CadreEspace'
import { ouvrirAutreDossier, quitterMonDossier } from '@/lib/acces/action-porteur'
import { NOM_COOKIE_CAPACITE } from '@/lib/acces/session'
import { autresDossiers } from '@/lib/acces/trousseau'
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

  // La presence du cookie ne sert qu'a afficher la sortie : sans dossier
  // ouvert (lien refuse, remise de donnees), il n'y a rien a quitter. Les
  // pages verifient toujours le jeton elles-memes.
  const magasin = await cookies()
  const dossierOuvert = Boolean(magasin.get(NOM_COOKIE_CAPACITE)?.value)

  // Les autres dossiers ouverts dans ce navigateur (une personne garante de
  // deux dossiers, ou locataire de l'un et garante de l'autre). Le cadre ne
  // montre que leur role ; rouvrir l'un d'eux reverifie son jeton.
  const autres = dossierOuvert ? await autresDossiers((nom) => magasin.get(nom)?.value) : []

  return (
    <CadreEspace
      sortie={
        dossierOuvert ? (
          <>
            {autres.map((autre, rang) => (
              <form action={ouvrirAutreDossier} key={autre.place}>
                <input type="hidden" name="place" value={autre.place} />
                <button type="submit" className="lien-espace">
                  {sessionPorteur.autre[autre.partie]}
                  {autres.filter((a) => a.partie === autre.partie).length > 1
                    ? ` (${autres.slice(0, rang + 1).filter((a) => a.partie === autre.partie).length})`
                    : ''}
                </button>
              </form>
            ))}
            <form action={quitterMonDossier}>
              <button type="submit" className="lien-espace">
                {sessionPorteur.quitter}
              </button>
            </form>
          </>
        ) : null
      }
    >
      {children}
    </CadreEspace>
  )
}
