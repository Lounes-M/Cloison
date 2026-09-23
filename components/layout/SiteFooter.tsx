import { Logo } from '@/components/brand/Logo'
import { footerLinks, site } from '@/lib/site'

export function SiteFooter() {
  return (
    <footer className="bg-ink text-cream overflow-hidden px-6 pt-12 pb-9 md:px-10">
      <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <Logo variant="inverse" className="text-lg" />
        <nav
          aria-label="Navigation de pied de page"
          className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13.5px] font-semibold sm:flex sm:flex-wrap"
        >
          {footerLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-cream/80 hover:text-sun focus-visible:outline-sun inline-flex min-h-11 items-center underline-offset-4 transition-colors hover:underline"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>

      {/* Lettrage geant en contour seul : signature de bas de page. */}
      <div
        aria-hidden
        className="font-display mt-9 text-center text-[clamp(3rem,18vw,150px)] leading-none text-transparent select-none [-webkit-text-stroke:2px_#3a3a3a]"
      >
        CLOISON
      </div>

      <p className="text-cream/70 mx-auto mt-6 max-w-[1200px] border-t border-white/15 pt-6 text-xs leading-relaxed">
        © {new Date().getFullYear()} {site.name} · {site.tagline}.
      </p>
    </footer>
  )
}
