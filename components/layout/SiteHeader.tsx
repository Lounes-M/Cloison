import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { MenuMobile } from '@/components/layout/MenuMobile'
import { navLinks } from '@/lib/site'

export function SiteHeader() {
  return (
    <header className="bg-cream/90 sticky top-0 z-50 max-h-dvh overflow-y-auto px-4 py-4 backdrop-blur-md md:px-10">
      <nav
        aria-label="Navigation principale"
        className="bg-paper shadow-brut-sm outlined mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 rounded-[14px] px-3 py-3 sm:px-5 md:px-6"
      >
        <Logo className="text-lg md:text-xl" />

        <div className="flex items-center gap-6 text-sm font-semibold md:gap-7">
          <div className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-cobalt transition-colors">
                {link.label}
              </a>
            ))}
          </div>
          <Button href="/demarrer" tone="flame" size="sm">
            Démarrer
          </Button>
        </div>
        <MenuMobile />
      </nav>
    </header>
  )
}
