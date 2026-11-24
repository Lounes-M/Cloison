import { PageJuridique, SectionJuridique } from '@/components/juridique/PageJuridique'
import * as en from '@/lib/content/en/juridique'
import * as fr from '@/lib/content/juridique'
import { choisir, type Langue } from '@/lib/i18n'
import {
  editeurAffiche,
  retentionSauvegardes,
  traitementsFacultatifs,
} from '@/lib/juridique/editeur'

/**
 * L'information des articles 13 et 14 du RGPD, pour les trois espaces.
 *
 * Les traitements facultatifs (moteur documentaire distant, signature, OCR,
 * lecture IA) n'apparaissent que s'ils sont
 * actives dans cet environnement : la page decrit ce qui tourne vraiment.
 */
export function PageConfidentialite({ langue = 'fr' }: { langue?: Langue }) {
  const textes = choisir(langue, fr.confidentialite, en.confidentialite)
  const e = editeurAffiche(langue)
  const facultatifs = traitementsFacultatifs()
  // Sans duree declaree, la page ne dit rien des sauvegardes : mieux vaut un
  // silence signale qu'un chiffre par defaut.
  const retention = retentionSauvegardes()
  const moteur = facultatifs.moteurDocumentaire
  const incomplet = retention === null || (moteur !== null && moteur.hebergeur === null)

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
            ...(section.id === 'durees' && retention !== null
              ? [textes.sauvegardes(retention)]
              : []),
            ...(section.id === 'prestataires'
              ? [
                  ...(moteur ? [textes.facultatifs.moteurDocumentaire(moteur.hebergeur)] : []),
                  ...(facultatifs.signature
                    ? [textes.facultatifs.signature[facultatifs.signature]]
                    : []),
                  ...(facultatifs.ocr ? [textes.facultatifs.ocr] : []),
                  ...(facultatifs.lectureGarant ? [textes.facultatifs.lectureGarant] : []),
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
