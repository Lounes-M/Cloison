import { Icone } from '@/components/ui/Icone'
import { resteAFaire as t } from '@/lib/content/locataire'
import type { EtapeLocataire } from '@/lib/locataire/reste-a-faire'

const ancres: Record<EtapeLocataire, string> = {
  loyer: 'logement',
  paiement: 'paiement',
  garant: 'garant',
}

/** Le haut de l'espace du locataire : ses gestes, et ou les faire. */
export function ResteAFaireLocataire({ etapes }: { etapes: EtapeLocataire[] }) {
  return (
    <section aria-labelledby="reste-a-faire" className="panneau-espace mt-8">
      <h2 id="reste-a-faire" className="text-xl font-bold">
        {t.titre}
      </h2>
      {etapes.length ? (
        <>
          <p className="text-muted mt-2 text-[14px] font-medium">{t.aide}</p>
          <ul className="mt-4 flex flex-col gap-2">
            {etapes.map((etape) => (
              <li key={etape}>
                <a
                  href={`#${ancres[etape]}`}
                  className="bg-paper outlined flex items-start gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold"
                >
                  <Icone nom="direction" className="mt-0.5 size-4 shrink-0" />
                  <span className="underline underline-offset-4">{t.etapes[etape]}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 flex items-start gap-2 text-[15px] leading-relaxed font-medium">
          <Icone nom="coche" className="text-cobalt mt-0.5 size-5 shrink-0" />
          {t.attente}
        </p>
      )}
    </section>
  )
}
