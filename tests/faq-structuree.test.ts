import { isValidElement, type ReactNode } from 'react'
import { expect, test } from 'vitest'
import PageQuestions from '@/app/(marketing)/questions/page'
import { DonneesStructurees } from '@/components/seo/DonneesStructurees'
import { questions } from '@/lib/content/questions'
import { faqStructuree, jsonPourScript } from '@/lib/seo/faq'

test('chaque question affichee figure dans la FAQ structuree, au mot pres', () => {
  const faq = faqStructuree(questions.groupes)
  const affichees: { question: string; reponse: string }[] = questions.groupes.flatMap(
    (g): readonly { question: string; reponse: string }[] => g.questions,
  )
  expect(faq.mainEntity).toHaveLength(affichees.length)
  for (const [i, q] of affichees.entries()) {
    expect(faq.mainEntity[i]).toEqual({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.reponse },
    })
  }
})

test('un texte ne peut pas fermer la balise du bloc de donnees', () => {
  const json = jsonPourScript({ texte: '</script><script>alert(1)</script>' })
  expect(json).not.toContain('<')
  expect(JSON.parse(json)).toEqual({ texte: '</script><script>alert(1)</script>' })
})

test('la page des questions pose le bloc de donnees', () => {
  function trouver(noeud: ReactNode): unknown {
    if (Array.isArray(noeud)) return noeud.map(trouver).find(Boolean)
    if (!isValidElement<{ children?: ReactNode; donnees?: unknown }>(noeud)) return undefined
    if (noeud.type === DonneesStructurees) return noeud.props.donnees
    return trouver(noeud.props.children)
  }
  expect(trouver(PageQuestions())).toEqual(faqStructuree(questions.groupes))
})
