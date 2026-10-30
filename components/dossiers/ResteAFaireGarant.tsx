import { Icone } from '@/components/ui/Icone'
import { resteAFaire as t } from '@/lib/content/garant'
import type { EtapeRestante } from '@/lib/garant/reste-a-faire'

function cible(etape: EtapeRestante) {
  switch (etape.sorte) {
    case 'engagement':
      return { ancre: 'engagement', texte: t.engagement }
    case 'complement':
      return { ancre: 'complements', texte: t.complement(etape.nombre) }
    case 'piece':
      return {
        ancre: `piece-${etape.nature}`,
        texte: t.piece(etape.libelle, etape.manque, etape.attendu),
      }
    case 'mention':
      return { ancre: 'mention', texte: t.mention }
  }
}

/** Le haut de l'espace du garant : ce qui manque, et ou le faire. */
export function ResteAFaireGarant({ etapes }: { etapes: EtapeRestante[] }) {
  return (
    <section aria-labelledby="reste-a-faire" className="panneau-espace mt-8">
      <h2 id="reste-a-faire" className="text-xl font-bold">
        {t.titre}
      </h2>
      {etapes.length ? (
        <>
          <p className="text-muted mt-2 text-[14px] font-medium">{t.aide}</p>
          <ul className="mt-4 flex flex-col gap-2">
            {etapes.map((etape) => {
              const { ancre, texte } = cible(etape)
              return (
                <li key={ancre}>
                  <a
                    href={`#${ancre}`}
                    className="bg-paper outlined flex items-start gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold"
                  >
                    <Icone nom="direction" className="mt-0.5 size-4 shrink-0" />
                    <span className="underline underline-offset-4">{texte}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="mt-3 flex items-start gap-2 text-[15px] leading-relaxed font-medium">
          <Icone nom="coche" className="text-cobalt mt-0.5 size-5 shrink-0" />
          {t.termine}
        </p>
      )}
    </section>
  )
}
