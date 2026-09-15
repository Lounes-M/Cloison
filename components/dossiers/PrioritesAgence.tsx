import Link from 'next/link'
import type { ContexteAgence } from '@/lib/agences/contexte'
import { lirePriorites } from '@/lib/agences/priorites'
import { pilotage as t } from '@/lib/content/pilotage'

export async function PrioritesAgence({
  contexte,
}: {
  contexte: Extract<ContexteAgence, { etat: 'rattache' }>
}) {
  const nombres = await lirePriorites(contexte)
  return (
    <section className="panneau-espace mt-8" aria-label={t.titre}>
      <h2 className="font-display text-2xl uppercase">{t.titre}</h2>
      <p className="text-muted mt-2 text-sm">{t.aide}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {t.indicateurs.map((carte) => {
          const nombre = nombres.find((n) => n.cle === carte.cle)?.nombre
          return (
            <li key={carte.cle}>
              <Link href={carte.href} className="lien-espace w-full justify-between gap-4">
                <span>{carte.titre}</span>
                <strong>{nombre == null ? t.indisponible : nombre.toLocaleString('fr-FR')}</strong>
              </Link>
            </li>
          )
        })}
      </ul>
      {nombres.some((n) => n.nombre === null) ? (
        <p role="status" className="text-muted mt-3 text-sm">
          {t.panne}
        </p>
      ) : null}
    </section>
  )
}
