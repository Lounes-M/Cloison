'use client'

import { useRef } from 'react'
import { navLinks } from '@/lib/site'
import { navigationMobile } from '@/lib/content/navigation'

export function MenuMobile() {
  const menu = useRef<HTMLDetailsElement>(null)
  return (
    <details
      ref={menu}
      className="w-full md:hidden"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu.current?.open) {
          menu.current.open = false
          menu.current.querySelector('summary')?.focus()
          event.preventDefault()
        }
      }}
    >
      <summary className="outlined bg-sun shadow-brut-xs min-h-11 cursor-pointer rounded-lg px-4 py-3 text-sm font-bold">
        {navigationMobile.menu}
      </summary>
      <div className="mt-3 grid gap-2 border-t-2 pt-3">
        {navLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            onClick={() => {
              if (menu.current) menu.current.open = false
            }}
            className="hover:bg-sun rounded-lg px-4 py-3 text-sm font-semibold"
          >
            {link.label}
          </a>
        ))}
      </div>
    </details>
  )
}
