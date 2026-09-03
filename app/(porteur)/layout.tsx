import { Logo } from '@/components/brand/Logo'

/**
 * L'espace des porteurs de lien : le locataire et le garant.
 *
 * Aussi depouille que l'espace agence, et pour la meme raison : quelqu'un qui
 * suit son dossier ou depose ses pieces n'a que faire d'un menu « Tarifs ».
 *
 * Un groupe distinct de `(agence)` bien que le chrome soit le meme aujourd'hui.
 * Ce sont deux populations qui ne partagent ni session, ni role Postgres, ni
 * avenir : le jour ou l'un des deux espaces a besoin d'une navigation, l'autre
 * ne doit pas l'heriter par accident.
 */
export default function LayoutPorteur({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper flex min-h-dvh flex-col">
      <header className="border-ink flex items-center border-b-2 px-6 py-5 md:px-10">
        <Logo className="text-2xl" />
      </header>

      <main className="flex flex-1 justify-center px-6 py-12 md:px-10 md:py-16">{children}</main>
    </div>
  )
}
