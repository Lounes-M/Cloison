import { interfaceEspace as t } from '@/lib/content/interface'
const tons = { mint: 'bg-mint', sun: 'bg-sun', sky: 'bg-sky' }
export function RepereParcours() {
  return (
    <aside className="border-ink/15 min-w-0 border-t pt-6 lg:sticky lg:top-28 lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
      <p className="mb-5 max-w-sm text-lg leading-tight font-bold">{t.parcours}</p>
      <ol className="grid gap-5">
        {t.roles.map((role, i) => (
          <li key={role.nom} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${tons[role.ton]}`}
            >
              0{i + 1}
            </span>
            <div>
              <p className="mb-1 font-bold">{role.nom}</p>
              <p className="text-muted text-sm leading-relaxed">{role.texte}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  )
}
