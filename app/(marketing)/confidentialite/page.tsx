import type { Metadata } from 'next'

import { PageJuridique, SectionJuridique } from '@/components/juridique/PageJuridique'
import { confidentialite as textes, juridique } from '@/lib/content/juridique'
import { editeur, retentionSauvegardes, traitementsFacultatifs } from '@/lib/juridique/editeur'

export const metadata: Metadata = {
  title: textes.titre,
  description: textes.description,
  alternates: { canonical: '/confidentialite' },
}

/**
 * L'information des articles 13 et 14 du RGPD, pour les trois espaces.
 *
 * Les traitements facultatifs (signature, OCR) n'apparaissent que s'ils sont
 * actives dans cet environnement : la page decrit ce qui tourne vraiment.
 */
export default function PageConfidentialite() {
  const e = editeur()
  const facultatifs = traitementsFacultatifs()
  const sauvegardes = retentionSauvegardes()
  const incomplet = !e.denomination || !e.courriel || sauvegardes === null

  return (
    <PageJuridique titre={textes.titre} incomplet={incomplet}>
      <p>{textes.introduction}</p>
      <p>{textes.responsable(e.denomination ?? juridique.aCompleter)}</p>

      {textes.sections.map((section) => (
        <SectionJuridique
          key={section.id}
          titre={section.titre}
          paragraphes={[
            ...section.paragraphes,
            ...(section.id === 'durees'
              ? [sauvegardes === null ? juridique.aCompleter : textes.sauvegardes(sauvegardes)]
              : []),
            ...(section.id === 'prestataires'
              ? [
                  ...(facultatifs.signature ? [textes.facultatifs.signature] : []),
                  ...(facultatifs.ocr ? [textes.facultatifs.ocr] : []),
                ]
              : []),
          ]}
        />
      ))}

      <SectionJuridique titre={textes.droits.titre} paragraphes={textes.droits.paragraphes}>
        <p className="font-semibold">{textes.droits.contact(e.courriel ?? juridique.aCompleter)}</p>
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
