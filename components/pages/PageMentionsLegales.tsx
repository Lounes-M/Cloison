import { PageJuridique, SectionJuridique, Valeur } from '@/components/juridique/PageJuridique'
import * as en from '@/lib/content/en/juridique'
import * as fr from '@/lib/content/juridique'
import { choisir, type Langue } from '@/lib/i18n'
import { editeurAffiche } from '@/lib/juridique/editeur'

/** Les mentions de l'article 6 de la loi pour la confiance dans l'economie numerique. */
export function PageMentionsLegales({ langue = 'fr' }: { langue?: Langue }) {
  const textes = choisir(langue, fr.mentionsLegales, en.mentionsLegales)
  const e = editeurAffiche(langue)
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
    <PageJuridique langue={langue} titre={textes.titre} incomplet={e.manquants.length > 0}>
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
                    <Valeur langue={langue} valeur={valeur} />
                  )}
                </dd>
              </div>
            ))}
        </dl>
      </SectionJuridique>

      <SectionJuridique titre={textes.hebergement} paragraphes={[...textes.hebergementTexte]} />

      <SectionJuridique titre={textes.donnees} paragraphes={[textes.donneesTexte]} />

      <SectionJuridique
        titre={textes.autres}
        paragraphes={[textes.propriete, textes.signalement]}
      />
    </PageJuridique>
  )
}
