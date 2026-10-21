import type { Metadata } from 'next'

import { PageJuridique, SectionJuridique, Valeur } from '@/components/juridique/PageJuridique'
import { mentionsLegales as textes } from '@/lib/content/juridique'
import { editeur } from '@/lib/juridique/editeur'

export const metadata: Metadata = {
  title: textes.titre,
  description: textes.description,
  alternates: { canonical: '/mentions-legales' },
}

/** Les mentions de l'article 6 de la loi pour la confiance dans l'economie numerique. */
export default function PageMentionsLegales() {
  const e = editeur()
  const lignes = [
    ['denomination', e.denomination],
    ['forme', e.forme],
    ['capital', e.capital],
    ['siren', e.siren],
    ['rcs', e.rcs],
    ['tva', e.tva],
    ['adresse', e.adresse],
    ['telephone', e.telephone],
    ['courriel', e.courriel],
    ['directeurPublication', e.directeurPublication],
  ] as const
  // Les champs facultatifs n'apparaissent que renseignes ; les obligatoires
  // apparaissent toujours, au besoin comme « a completer ».
  const facultatifs = new Set(['capital', 'rcs', 'tva', 'telephone'])

  return (
    <PageJuridique titre={textes.titre} incomplet={e.manquants.length > 0}>
      <SectionJuridique titre={textes.editeur}>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {lignes
            .filter(([cle, valeur]) => valeur || !facultatifs.has(cle))
            .map(([cle, valeur]) => (
              <div key={cle} className="contents">
                <dt className="font-semibold">{textes.libelles[cle]}</dt>
                <dd className="break-words">
                  {cle === 'courriel' && valeur ? (
                    <a href={`mailto:${valeur}`} className="underline underline-offset-4">
                      {valeur}
                    </a>
                  ) : (
                    <Valeur valeur={valeur} />
                  )}
                </dd>
              </div>
            ))}
        </dl>
      </SectionJuridique>

      <SectionJuridique titre={textes.hebergement}>
        <ul className="space-y-4">
          {textes.hebergeurs.map((h) => (
            <li key={h.nom}>
              <p className="font-semibold">{h.nom}</p>
              <p>{h.role}</p>
              {h.adresse ? <p>{h.adresse}</p> : null}
              <a href={h.site} className="underline underline-offset-4" rel="noopener">
                {h.site.replace('https://', '')}
              </a>
            </li>
          ))}
        </ul>
      </SectionJuridique>

      <SectionJuridique
        titre={textes.autres}
        paragraphes={[textes.propriete, textes.signalement]}
      />
    </PageJuridique>
  )
}
