import Link from 'next/link'
import type { ContexteAgence } from '@/lib/agences/contexte'
import { lirePriorites } from '@/lib/agences/priorites'
import { pilotage as tFr } from '@/lib/content/pilotage'
import { pilotage as tEn } from '@/lib/content/en/pilotage'
import { choisir, locale } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

export async function PrioritesAgence({
  contexte,
}: {
  contexte: Extract<ContexteAgence, { etat: 'rattache' }>
}) {
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)

  const nombres = await lirePriorites(contexte)
  return (
    <section className="panneau-espace mt-8" aria-label={t.titre}>
      <h2 className="text-xl font-bold">{t.titre}</h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {t.indicateurs.map((carte) => {
          const nombre = nombres.find((n) => n.cle === carte.cle)?.nombre
          return (
            <li key={carte.cle}>
              <Link href={carte.href} className="carte-priorite">
                <span className="text-[13px] leading-snug font-semibold hyphens-auto sm:text-sm">
                  {carte.titre}
                </span>
                <strong
                  className={
                    nombre == null
                      ? 'text-sm'
                      : nombre === 0
                        ? 'text-muted text-3xl font-medium tabular-nums'
                        : 'text-cobalt text-3xl tabular-nums'
                  }
                >
                  {nombre == null ? t.indisponible : nombre.toLocaleString(locale(langue))}
                </strong>
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="text-muted mt-4 text-xs leading-relaxed">{t.aide}</p>
      {nombres.some((n) => n.nombre === null) ? (
        <p role="status" className="text-muted mt-3 text-sm">
          {t.panne}
        </p>
      ) : null}
    </section>
  )
}
