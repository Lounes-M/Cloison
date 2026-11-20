import { connection } from 'next/server'

import { FormulaireConnexion } from '@/components/forms/FormulaireConnexion'
import { Photo } from '@/components/ui/Photo'
import { Reveal } from '@/components/ui/Reveal'
import { interfaceEspace as interfaceEn } from '@/lib/content/en/interface'
import { interfaceEspace as interfaceFr } from '@/lib/content/interface'
import { choisir, type Langue } from '@/lib/i18n'

/**
 * La connexion agence, habillee comme le site public.
 *
 * Meme gabarit que Demarrer : un en-tete vert qui porte le formulaire sur une
 * carte creme, puis les trois roles en cartes. La page reste sous le proxy de
 * l'applicatif (`/connexion/:path*`) : rendue a chaque requete, pour porter le
 * nonce de sa Content-Security-Policy.
 */
export async function PageConnexion({
  searchParams,
  langue = 'fr',
}: {
  searchParams: Promise<{ echec?: string }>
  langue?: Langue
}) {
  await connection()
  const interfaceEspace = choisir(langue, interfaceFr, interfaceEn)
  const { echec } = await searchParams

  return (
    <main>
      <section
        data-premiere-section="sombre"
        className="passe-sous-entete bg-cobalt relative overflow-hidden text-white"
      >
        <div className="gouttiere relative pt-[calc(var(--entete-total)+4.5rem)] pb-[6rem] max-[767px]:pt-[calc(var(--entete-total)+1.25rem)] max-[767px]:pb-[2.5rem]">
          <div className="conteneur flex flex-col gap-[1.5rem] md:grid md:grid-cols-[1fr_32rem] md:items-start md:gap-[4rem]">
            {/* Sur mobile, le formulaire remonte juste sous le titre. */}
            <div className="max-md:contents">
              <p className="texte-14 flex items-center gap-[0.6rem] font-semibold uppercase max-md:hidden">
                <span aria-hidden className="bg-flame size-[0.6rem] rounded-full" />
                {interfaceEspace.connexion}
              </p>
              <h1 className="titre-84 md:mt-[1rem]">{interfaceEspace.connexionTitre}</h1>
              <div className="max-md:order-3">
                <p className="texte-24 max-[479px]:leading-[1.4] md:mt-[1.5rem]">
                  {interfaceEspace.connexionTexte}
                </p>
                <Photo
                  src="/accueil/espace-agence.jpg"
                  sizes="(min-width: 768px) 40vw, 1px"
                  priority
                  className="mt-[3rem] hidden aspect-[25.7/15.5] rounded-[1.5rem] [clip-path:polygon(0_6%,100%_0,100%_100%,0_100%)] md:block"
                />
              </div>
            </div>
            <div className="espace-shell bg-cream text-ink rounded-[1.5rem] p-[2.5rem] max-[479px]:p-5 max-md:order-2">
              <FormulaireConnexion lienExpire={echec === 'lien'} langue={langue} />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-cream gouttiere section-espace">
        <div className="conteneur">
          <Reveal>
            <h2 className="titre-84 text-center">{interfaceEspace.parcours}</h2>
          </Reveal>
          <ol className="mt-[4rem] grid gap-[1.66rem] max-[767px]:mt-8 md:grid-cols-3">
            {interfaceEspace.roles.map((role, index) => (
              <li key={role.nom}>
                <Reveal delay={index * 0.08} className="h-full">
                  <article className="lift bg-paper flex h-full min-h-[18rem] flex-col rounded-[1.5rem] p-[1.5rem] max-[767px]:min-h-0">
                    <span className="texte-16">{String(index + 1).padStart(2, '0')}</span>
                    <h3 className="texte-28 text-cobalt mt-[0.75rem]">{role.nom}</h3>
                    <p className="mt-auto pt-6">{role.texte}</p>
                  </article>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  )
}
