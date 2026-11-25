import { isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { PageQuestions } from '@/components/pages/PageQuestions'
import { DonneesStructurees } from '@/components/seo/DonneesStructurees'
import { questions as questionsEn } from '@/lib/content/en/questions'
import { prixActe as prixActeEn, prixLocataire as prixLocataireEn } from '@/lib/content/en/tarifs'
import { groupesAffiches, questions } from '@/lib/content/questions'
import { prixActe, prixLocataire } from '@/lib/content/tarifs'
import { faqStructuree, jsonPourScript } from '@/lib/seo/faq'

afterEach(() => {
  vi.unstubAllEnvs()
})

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
  expect(trouver(PageQuestions({}))).toEqual(faqStructuree(questions.groupes))
  // La page anglaise decrit ses propres questions, pas les francaises.
  expect(trouver(PageQuestions({ langue: 'en' }))).toEqual(faqStructuree(questionsEn.groupes))
})

test('les trois prix sont ceux du code, dans les deux langues', () => {
  for (const [source, locataire, acte, rien, acteLibelle] of [
    [questions.groupes, prixLocataire, prixActe, /garant ne paie rien/, /par acte/],
    [questionsEn.groupes, prixLocataireEn, prixActeEn, /guarantor pays nothing/, /per signed/],
  ] as const) {
    const reponses = source.flatMap((g) => g.questions.map((q) => q.reponse)).join('\n')
    expect(reponses).toContain(locataire)
    expect(reponses).toContain(acte)
    expect(reponses).toMatch(rien)
    expect(reponses).toMatch(acteLibelle)
  }
  const tout = [...questions.groupes, ...questionsEn.groupes]
    .flatMap((g) => g.questions.map((q) => `${q.question} ${q.reponse}`))
    .join('\n')
  expect(tout).not.toMatch(/L’agence seulement|Only the agency/)
})

test('la reponse sur les pieces du garant dit les lectures automatiques activees', () => {
  const reponse = (
    actifs: { lectureGarant: boolean; ocr: boolean },
    source: Parameters<typeof groupesAffiches>[0] = questions.groupes,
  ) =>
    groupesAffiches(source, actifs)
      .find((g) => g.id === 'garant')!
      .questions.find((q) => /pièces|documents/.test(q.question))!.reponse

  const seule = reponse({ lectureGarant: false, ocr: false })
  expect(seule).toMatch(/^L’agence rattachée à votre dossier/)
  expect(seule).not.toMatch(/L’agence seulement/)
  expect(seule).not.toMatch(/Only the agency/)
  expect(seule).not.toContain('IA')
  expect(seule).not.toContain('reconnaissance de texte')

  expect(reponse({ lectureGarant: true, ocr: false })).toContain('une IA lit vos bulletins de paie')
  expect(reponse({ lectureGarant: false, ocr: true })).toContain('reconnaissance de texte')
  const anglaise = reponse({ lectureGarant: true, ocr: true }, questionsEn.groupes)
  expect(anglaise).toContain('an AI reads your payslips')
  expect(anglaise).toContain('text recognition service')

  // La page et ses donnees structurees suivent la configuration reelle, ensemble.
  vi.stubEnv('LECTURE_IA_GARANT', 'true')
  const html = renderToStaticMarkup(PageQuestions({}))
  expect(html.match(/une IA lit vos bulletins de paie/g)).toHaveLength(2)
})
