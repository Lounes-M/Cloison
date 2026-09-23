import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { MenuMobile } from '@/components/layout/MenuMobile'
import { navLinks } from '@/lib/site'

export function SiteHeader() {
  return (
    <header className="bg-cream/90 sticky top-0 z-50 px-4 py-3 backdrop-blur-md md:px-10">
      <nav
        aria-label="Navigation principale"
        className="bg-paper shadow-brut-sm outlined relative mx-auto flex max-w-[1200px] items-center justify-between gap-2 rounded-[14px] px-3 py-2 sm:px-5 md:px-6"
      >
        <Logo className="text-sm sm:text-lg md:text-xl" />

        <div className="ml-auto flex items-center gap-4 text-sm font-semibold lg:gap-6">
          <div className="hidden items-center gap-5 lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="hover:text-cobalt inline-flex min-h-11 items-center transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
          <Button
            href="/demarrer"
            tone="flame"
            size="sm"
            className="px-3 text-xs sm:px-5 sm:text-sm"
          >
            Démarrer
          </Button>
        </div>
        <MenuMobile />
      </nav>
    </header>
  )
}
