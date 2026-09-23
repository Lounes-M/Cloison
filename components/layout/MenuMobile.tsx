'use client'

import { useRef } from 'react'
import { navLinks } from '@/lib/site'
import { navigationMobile } from '@/lib/content/navigation'

export function MenuMobile() {
  const menu = useRef<HTMLDetailsElement>(null)
  return (
    <details
      ref={menu}
      className="lg:hidden"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu.current?.open) {
          menu.current.open = false
          menu.current.querySelector('summary')?.focus()
          event.preventDefault()
        }
      }}
    >
      <summary className="bg-sun min-h-11 cursor-pointer rounded-lg px-2 py-3 text-xs font-bold sm:px-3 sm:text-sm">
        {navigationMobile.menu}
      </summary>
      <div className="bg-paper outlined shadow-brut-sm absolute top-full right-0 left-0 mt-3 grid max-h-[70dvh] gap-1 overflow-y-auto rounded-xl p-3">
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
