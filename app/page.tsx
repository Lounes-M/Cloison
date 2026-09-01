import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { Hero } from '@/components/sections/Hero'
import { Marquee } from '@/components/sections/Marquee'
import { Positioning } from '@/components/sections/Positioning'
import { Pricing } from '@/components/sections/Pricing'
import { Problem } from '@/components/sections/Problem'
import { Product } from '@/components/sections/Product'
import { Vision } from '@/components/sections/Vision'
import { WhyNow } from '@/components/sections/WhyNow'

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Marquee />
        <Problem />
        <Product />
        <Positioning />
        <Pricing />
        <WhyNow />
        <Vision />
      </main>
      <SiteFooter />
    </>
  )
}
