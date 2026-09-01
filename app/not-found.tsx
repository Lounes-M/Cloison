import type { Metadata } from 'next'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Page introuvable',
}

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <Logo className="text-3xl" />
      <p className="font-display text-cobalt text-[clamp(3rem,12vw,120px)] leading-none">404</p>
      <p className="max-w-[420px] text-lg font-semibold">
        Cette porte ne mène nulle part. Rien n&apos;a fuité, il n&apos;y a juste rien ici.
      </p>
      <Button href="/">Retour à l&apos;accueil</Button>
    </main>
  )
}
