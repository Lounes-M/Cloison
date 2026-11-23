import { PageJuridique, SectionJuridique } from '@/components/juridique/PageJuridique'
import * as en from '@/lib/content/en/juridique'
import * as fr from '@/lib/content/juridique'
import { choisir, type Langue } from '@/lib/i18n'
import {
  editeurAffiche,
  retentionAffichee,
  retentionSauvegardes,
  traitementsFacultatifs,
} from '@/lib/juridique/editeur'

/**
 * L'information des articles 13 et 14 du RGPD, pour les trois espaces.
 *
 * Les traitements facultatifs (signature, OCR) n'apparaissent que s'ils sont
 * actives dans cet environnement : la page decrit ce qui tourne vraiment.
 */
export function PageConfidentialite({ langue = 'fr' }: { langue?: Langue }) {
  const textes = choisir(langue, fr.confidentialite, en.confidentialite)
  const e = editeurAffiche(langue)
  const facultatifs = traitementsFacultatifs()
  const incomplet = retentionSauvegardes() === null

  return (
    <PageJuridique langue={langue} titre={textes.titre} incomplet={incomplet}>
      <p>{textes.introduction}</p>
      <p>{textes.responsable(e.denomination)}</p>

      {textes.sections.map((section) => (
        <SectionJuridique
          key={section.id}
          titre={section.titre}
          paragraphes={[
            ...section.paragraphes,
            ...(section.id === 'durees' ? [textes.sauvegardes(retentionAffichee())] : []),
            ...(section.id === 'prestataires'
              ? [
                  ...(facultatifs.signature
                    ? [textes.facultatifs.signature[facultatifs.signature]]
                    : []),
                  ...(facultatifs.ocr ? [textes.facultatifs.ocr] : []),
                ]
              : []),
          ]}
        />
      ))}

      <SectionJuridique titre={textes.droits.titre} paragraphes={textes.droits.paragraphes}>
        <p className="font-semibold">{textes.droits.contact(e.courriel)}</p>
        <p>
          {textes.droits.cnil}{' '}
          <a href={textes.droits.lienCnil} className="underline underline-offset-4" rel="noopener">
            cnil.fr
          </a>
        </p>
      </SectionJuridique>
    </PageJuridique>
  )
}
