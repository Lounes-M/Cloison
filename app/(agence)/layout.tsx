import { cookies } from 'next/headers'
import { estCookieSessionAgence } from '@/lib/acces/cookies-agence'
import { seDeconnecter } from '@/lib/agences/action-securite'
import { securite as securiteFr } from '@/lib/content/securite'
import { connection } from 'next/server'

import { CadreEspace } from '@/components/layout/CadreEspace'
import { DocumentRacine } from '@/components/layout/DocumentRacine'
import { metadonneesRacine, vueRacine } from '@/lib/seo/racine'
import { support as supportFr } from '@/lib/content/espace'
import { env } from '@/lib/env'
import { securite as securiteEn } from '@/lib/content/en/securite'
import { support as supportEn } from '@/lib/content/en/espace'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

export const metadata = metadonneesRacine
export const viewport = vueRacine

/**
 * L'espace agence.
 *
 * L'identite de la home accompagne les outils : creme, cobalt et contours francs.
 * La navigation reste centree sur le travail et ne remplace aucun controle d'acces.
 *
 * Le logo ramene au site public ; la deconnexion reste accessible depuis chaque
 * ecran agence, y compris apres le second facteur et une exclusion.
 */
export default async function LayoutAgence({ children }: { children: React.ReactNode }) {
  const langue = await langueEspace()
  const securite = choisir(langue, securiteFr, securiteEn)
  const support = choisir(langue, supportFr, supportEn)

  // Rendu a chaque requete, jamais prerendu : la Content-Security-Policy de
  // l'applicatif porte un nonce que le proxy tire par requete, et une
  // page prerendue au build ne pourrait pas le porter. Ses scripts seraient
  // alors refuses par le navigateur, sans bruit.
  await connection()

  const adresseDeSupport = env.emailSupport
  // La presence du cookie ne sert qu a afficher la sortie, meme si Auth est
  // indisponible. Les pages verifient toujours l identite et les droits.
  const afficherSortie = (await cookies())
    .getAll()
    .some(({ name, value }) => Boolean(value) && estCookieSessionAgence(name))

  return (
    <DocumentRacine langue={langue}>
      <CadreEspace
        agence
        navigation={afficherSortie}
        sortie={
          afficherSortie ? (
            <form action={seDeconnecter}>
              <button type="submit" className="lien-espace">
                {securite.deconnexion}
              </button>
            </form>
          ) : null
        }
        footer={
          adresseDeSupport ? (
            <footer className="border-ink border-t-2 px-6 py-5 md:px-10">
              <p className="text-muted mx-auto max-w-[880px] text-[13px] leading-relaxed font-medium">
                <strong className="text-ink">{support.titre}</strong>{' '}
                {support.texte(adresseDeSupport)} {support.limite}
              </p>
            </footer>
          ) : null
        }
      >
        {children}
      </CadreEspace>
    </DocumentRacine>
  )
}
