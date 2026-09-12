import { Logo } from '@/components/brand/Logo'
import { footerLinks, site } from '@/lib/site'

export function SiteFooter() {
  return (
    <footer className="bg-ink text-cream overflow-hidden px-6 pt-12 pb-9 md:px-10">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-5">
        <Logo variant="inverse" className="text-lg" />
        <nav
          aria-label="Navigation de pied de page"
          className="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] font-semibold opacity-80"
        >
          {footerLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center transition-opacity hover:opacity-100"
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

      <p className="mx-auto mt-6 max-w-[1200px] text-xs opacity-50">
        © {new Date().getFullYear()} {site.name} · {site.tagline}.
      </p>
    </footer>
  )
}
