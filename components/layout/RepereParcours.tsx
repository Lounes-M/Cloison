import { interfaceEspace as t } from '@/lib/content/interface'
import { Icone } from '@/components/ui/Icone'
const tons = { mint: 'bg-mint', sun: 'bg-sun', sky: 'bg-sky' }
export function RepereParcours() {
  return (
    <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start">
      <p className="font-display mb-6 max-w-sm text-2xl leading-tight uppercase">{t.parcours}</p>
      <ol className="grid gap-4">
        {t.roles.map((role, i) => (
          <li
            key={role.nom}
            className={`outlined shadow-brut-sm rounded-brut p-5 ${tons[role.ton]}`}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <span className="font-display text-xl uppercase">{role.nom}</span>
              <span
                aria-hidden="true"
                className="bg-paper outlined grid size-9 place-items-center rounded-full text-xs font-bold"
              >
                0{i + 1}
              </span>
            </div>
            <p className="text-sm leading-relaxed font-medium">{role.texte}</p>
          </li>
        ))}
      </ol>
      <Icone
        nom="asterisque"
        className="text-flame motion-safe:animate-spin-slow mx-auto mt-8 hidden size-12 lg:block"
      />
    </aside>
  )
}
