import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import PageQuestions from '@/app/(marketing)/questions/page'
import { questions } from '@/lib/content/questions'
import { prixActe, prixLocataire } from '@/lib/content/tarifs'
import { footerLinks } from '@/lib/site'
import sitemap from '@/app/sitemap'

test('chaque groupe a son ancre, et chaque question sa reponse dans un details', () => {
  const html = renderToStaticMarkup(PageQuestions())
  for (const g of questions.groupes) {
    expect(html).toContain(`id="${g.id}"`)
    expect(html).toContain(`href="#${g.id}"`)
  }
  const total = questions.groupes.reduce((n, g) => n + g.questions.length, 0)
  expect(html.match(/<details/g)?.length).toBe(total)
  expect(html.match(/<h1/g)?.length).toBe(1)
})

test('les prix viennent des tarifs, et le garant ne paie jamais', () => {
  const [locataire, garant, agence] = questions.groupes
  expect(locataire!.questions[0]!.reponse).toContain(prixLocataire)
  expect(agence!.questions[0]!.reponse).toContain(prixActe)
  expect(garant!.questions[0]!.reponse).toMatch(/^Jamais\./)
})

test('le locataire est tutoye, le garant et l agence vouvoyes', () => {
  const [locataire, garant, agence] = questions.groupes
  const texte = (g: (typeof questions.groupes)[number] | undefined) =>
    g!.questions.map((q) => `${q.question} ${q.reponse}`).join(' ')
  expect(texte(locataire)).not.toMatch(/\bvous\b|\bvotre\b/i)
  expect(texte(garant)).not.toMatch(/\btu\b|\bton\b|\bta\b|\btes\b/i)
  expect(texte(agence)).not.toMatch(/\btu\b|\bton\b|\bta\b|\btes\b/i)
})

test('la page est dans le pied de page et le plan du site', () => {
  expect(footerLinks.some((l) => l.href === '/questions')).toBe(true)
  expect(sitemap().some((e) => e.url.endsWith('/questions'))).toBe(true)
})
