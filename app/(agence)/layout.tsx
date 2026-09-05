import { connection } from 'next/server'

import { Logo } from '@/components/brand/Logo'

/**
 * L'espace agence.
 *
 * Volontairement depouille, et c'est la raison d'etre du groupe de routes : un
 * collaborateur qui consulte un dossier n'a que faire d'un menu « Tarifs » et
 * d'un bouton « Demarrer ». Le layout marketing le disait deja en creux quand
 * il a ete separe du layout racine ; voici l'autre moitie.
 *
 * Le logo reste, et rien d'autre. Il ramene au site public, ce qui est la seule
 * navigation utile tant qu'il n'y a qu'un ecran.
 */
export default async function LayoutAgence({ children }: { children: React.ReactNode }) {
  // Rendu a chaque requete, jamais prerendu : la Content-Security-Policy de
  // l'applicatif porte un nonce que le middleware tire par requete, et une
  // page prerendue au build ne pourrait pas le porter. Ses scripts seraient
  // alors refuses par le navigateur, sans bruit.
  await connection()

  return (
    <div className="bg-paper flex min-h-dvh flex-col">
      <header className="border-ink flex items-center border-b-2 px-6 py-5 md:px-10">
        {/* `Logo` est deja un lien vers l'accueil : l'envelopper en produirait
            deux imbriques, ce qui est invalide et illisible au clavier. */}
        <Logo className="text-2xl" />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16 md:px-10">
        {children}
      </main>
    </div>
  )
}
