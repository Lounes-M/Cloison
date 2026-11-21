import { Icone } from '@/components/ui/Icone'
import { natures as naturesFr, resteAFaire as tFr } from '@/lib/content/garant'
import type { EtapeRestante } from '@/lib/garant/reste-a-faire'
import { natures as naturesEn, resteAFaire as tEn } from '@/lib/content/en/garant'
import { choisir, type Langue } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

function cible(etape: EtapeRestante, langue: Langue) {
  const t = choisir(langue, tFr, tEn)
  switch (etape.sorte) {
    case 'engagement':
      return { ancre: 'engagement', texte: t.engagement }
    case 'complement':
      return { ancre: 'complements', texte: t.complement(etape.nombre) }
    case 'piece':
      return {
        ancre: `piece-${etape.nature}`,
        texte: t.piece(
          choisir(langue, naturesFr, naturesEn).find((n) => n.valeur === etape.nature)?.libelle ??
            etape.libelle,
          etape.manque,
          etape.attendu,
        ),
      }
    case 'mention':
      return { ancre: 'mention', texte: t.mention }
  }
}

/** Le haut de l'espace du garant : ce qui manque, et ou le faire. */
export async function ResteAFaireGarant({ etapes }: { etapes: EtapeRestante[] }) {
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)

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
              const { ancre, texte } = cible(etape, langue)
              return (
                <li key={ancre}>
                  <a
                    href={`#${ancre}`}
                    className="bg-paper outlined hover:border-cobalt flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors"
                  >
                    <span>{texte}</span>
                    <Icone nom="fleche" className="text-cobalt size-4 shrink-0 rotate-90" />
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
