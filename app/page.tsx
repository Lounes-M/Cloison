import { Hero } from '@/components/sections/Hero'
import { Marquee } from '@/components/sections/Marquee'
import { Parcours } from '@/components/sections/Parcours'
import { Pricing } from '@/components/sections/Pricing'
import { Problem } from '@/components/sections/Problem'
import { Product } from '@/components/sections/Product'
import { Vision } from '@/components/sections/Vision'
import { WhyNow } from '@/components/sections/WhyNow'

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Marquee />
      <Problem />
      <Parcours />
      <Product />
      <Pricing />
      <WhyNow />
      <Vision />
    </main>
  )
}
