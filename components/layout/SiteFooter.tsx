import { Logo } from '@/components/brand/Logo'
import { footerLinks, site } from '@/lib/site'

export function SiteFooter() {
  return (
    <footer className="bg-cobalt text-white">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-8 md:px-6 lg:flex-row lg:items-center lg:justify-between">
        <p className="flex items-center gap-3 text-sm">
          <Logo variant="inverse" className="text-base" />
          <span className="opacity-80">{site.tagline}</span>
        </p>
        <nav
          aria-label="Navigation de pied de page"
          className="flex flex-wrap gap-x-6 gap-y-1 text-sm"
        >
          {footerLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="focus-visible:outline-sun inline-flex min-h-11 items-center underline underline-offset-4 opacity-90 transition-opacity hover:opacity-100"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <p className="text-sm opacity-80">
          © {new Date().getFullYear()} {site.name}
        </p>
      </div>
    </footer>
  )
}
