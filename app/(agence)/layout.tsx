import { cookies } from 'next/headers'
import { estCookieSessionAgence } from '@/lib/acces/cookies-agence'
import { seDeconnecter } from '@/lib/agences/action-securite'
import { securite } from '@/lib/content/securite'
import { connection } from 'next/server'

import { Logo } from '@/components/brand/Logo'
import { support } from '@/lib/content/espace'
import { env } from '@/lib/env'

/**
 * L'espace agence.
 *
 * Volontairement depouille, et c'est la raison d'etre du groupe de routes : un
 * collaborateur qui consulte un dossier n'a que faire d'un menu « Tarifs » et
 * d'un bouton « Demarrer ». Le layout marketing le disait deja en creux quand
 * il a ete separe du layout racine ; voici l'autre moitie.
 *
 * Le logo ramene au site public ; la deconnexion reste accessible depuis chaque
 * ecran agence, y compris apres le second facteur et une exclusion.
 */
export default async function LayoutAgence({ children }: { children: React.ReactNode }) {
  // Rendu a chaque requete, jamais prerendu : la Content-Security-Policy de
  // l'applicatif porte un nonce que le middleware tire par requete, et une
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
    <div className="bg-paper flex min-h-dvh flex-col">
      <header className="border-ink flex flex-wrap items-center justify-between gap-4 border-b-2 px-6 py-5 md:px-10">
        {/* `Logo` est deja un lien vers l'accueil : l'envelopper en produirait
            deux imbriques, ce qui est invalide et illisible au clavier. */}
        <Logo className="text-2xl" />
        {afficherSortie ? (
          <form action={seDeconnecter}>
            <button className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold underline underline-offset-4">
              {securite.deconnexion}
            </button>
          </form>
        ) : null}
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16 md:px-10">
        {children}
      </main>

      {/* Le canal de support, promis dans l'embarquement : il n'apparait
          qu'une fois l'adresse fixee. Afficher une adresse qui ne repond a
          personne serait pire que ne rien afficher. */}
      {adresseDeSupport ? (
        <footer className="border-ink border-t-2 px-6 py-5 md:px-10">
          <p className="text-muted mx-auto max-w-[880px] text-[13px] leading-relaxed font-medium">
            <strong className="text-ink">{support.titre}</strong> {support.texte(adresseDeSupport)}{' '}
            {support.limite}
          </p>
        </footer>
      ) : null}
    </div>
  )
}
