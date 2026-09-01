import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { navLinks } from '@/lib/site'

export function SiteHeader() {
  return (
    <header className="bg-cream/90 sticky top-0 z-50 px-4 py-4 backdrop-blur-md md:px-10">
      <nav
        aria-label="Navigation principale"
        className="bg-paper shadow-brut-sm outlined mx-auto flex max-w-[1200px] items-center justify-between rounded-[14px] px-5 py-3 md:px-6"
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
          <Button href="#demarrer" tone="flame" size="sm">
            Démarrer
          </Button>
        </div>
      </nav>
    </header>
  )
}
