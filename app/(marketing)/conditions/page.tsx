import type { Metadata } from 'next'

import { PageJuridique, SectionJuridique } from '@/components/juridique/PageJuridique'
import { conditions as textes } from '@/lib/content/juridique'
import { editeur } from '@/lib/juridique/editeur'

export const metadata: Metadata = {
  title: textes.titre,
  description: textes.description,
  alternates: { canonical: '/conditions' },
}

/** Les conditions des trois espaces, et le recours du consommateur. */
export default function PageConditions() {
  const e = editeur()

  return (
    <PageJuridique titre={textes.titre} incomplet={e.manquants.length > 0}>
      <p>{textes.introduction}</p>
      {textes.sections.map((section) => (
        <SectionJuridique key={section.id} titre={section.titre} paragraphes={section.paragraphes}>
          {section.id === 'litiges' ? (
            <>
              {e.mediateur ? (
                <p>
                  {textes.mediateur(e.mediateur.nom)}{' '}
                  <a
                    href={e.mediateur.site}
                    className="underline underline-offset-4"
                    rel="noopener"
                  >
                    {new URL(e.mediateur.site).host}
                  </a>
                </p>
              ) : null}
              <p>{textes.tribunaux}</p>
            </>
          ) : null}
        </SectionJuridique>
      ))}
    </PageJuridique>
  )
}
