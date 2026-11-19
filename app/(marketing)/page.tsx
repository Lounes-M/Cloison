import { Espaces } from '@/components/sections/Espaces'
import { Hero } from '@/components/sections/Hero'
import { Intro } from '@/components/sections/Intro'
import { Parcours } from '@/components/sections/Parcours'
import { Pilote } from '@/components/sections/Pilote'
import { Product } from '@/components/sections/Product'
import { Pourquoi } from '@/components/sections/Pourquoi'
import { Tarifs } from '@/components/sections/Tarifs'

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Intro />
      <Parcours />
      <Espaces />
      <Product />
      <Pourquoi />
      <Tarifs />
      <Pilote />
    </main>
  )
}
