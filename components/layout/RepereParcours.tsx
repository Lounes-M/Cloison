import { interfaceEspace as tFr } from '@/lib/content/interface'
import { interfaceEspace as tEn } from '@/lib/content/en/interface'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'
const tons = { mint: 'bg-mint', sun: 'bg-sun', sky: 'bg-sky' }
export async function RepereParcours() {
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)

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
