import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { Icone } from '@/components/ui/Icone'
import { interfaceEspace as t } from '@/lib/content/interface'

/** Identite commune, sans lecture de session ni decision d'autorisation. */
export function CadreEspace({
  children,
  sortie,
  footer,
  agence = false,
  navigation = false,
}: {
  children: React.ReactNode
  sortie?: React.ReactNode
  footer?: React.ReactNode
  agence?: boolean
  navigation?: boolean
}) {
  return (
    <div
      className="espace-shell bg-cream flex min-h-dvh flex-col"
      data-espace={agence ? 'agence' : 'porteur'}
    >
      <a
        href="#contenu-espace"
        className="bg-sun outlined fixed top-3 left-3 z-50 -translate-y-32 rounded-lg px-4 py-3 font-bold focus:translate-y-0"
      >
        {t.principal}
      </a>
      <header className="border-ink bg-cream relative z-10 border-b-2">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
          <div className="flex flex-wrap items-center gap-4">
            <Logo className="text-2xl" />
            <span className="bg-sun outlined rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase">
              {agence ? t.agence : t.porteur}
            </span>
          </div>
          <nav aria-label={t.navigation} className="flex flex-wrap items-center gap-3">
            {navigation ? (
              <Link href="/espace" className="lien-espace">
                {t.tableau}
              </Link>
            ) : null}
            {sortie}
          </nav>
        </div>
      </header>
      <div
        className="bandeau-espace border-ink bg-cobalt text-paper overflow-hidden border-b-2"
        aria-hidden="true"
      >
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-5 py-3 sm:px-8 lg:px-12">
          <span className="text-xs font-bold tracking-wider uppercase">{t.signature}</span>
          <Icone nom="asterisque" className="animate-spin-slow text-sun size-6 shrink-0" />
        </div>
      </div>
      <main
        id="contenu-espace"
        tabIndex={-1}
        className="espace-content relative mx-auto flex w-full max-w-[1280px] flex-1 justify-center px-5 py-10 sm:px-8 md:py-14 lg:px-12"
      >
        {children}
      </main>
      {footer}
    </div>
  )
}
