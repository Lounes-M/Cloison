import { Espaces } from '@/components/sections/Espaces'
import { Hero } from '@/components/sections/Hero'
import { Intro } from '@/components/sections/Intro'
import { Parcours } from '@/components/sections/Parcours'
import { Pourquoi } from '@/components/sections/Pourquoi'
import { Product } from '@/components/sections/Product'
import { Tarifs } from '@/components/sections/Tarifs'
import type { Langue } from '@/lib/i18n'

export function PageAccueil({ langue = 'fr' }: { langue?: Langue }) {
  return (
    <main>
      <Hero langue={langue} />
      <Intro langue={langue} />
      <Parcours langue={langue} />
      <Espaces langue={langue} />
      <Product langue={langue} />
      <Pourquoi langue={langue} />
      <Tarifs langue={langue} />
    </main>
  )
}
