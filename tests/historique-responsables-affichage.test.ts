import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { HistoriqueResponsables } from '@/components/dossiers/HistoriqueResponsables'
import { lirePositionResponsables, pageResponsables } from '@/lib/agences/historique-responsables'
const dossier = randomUUID()
const ligne = () => ({
  id: randomUUID(),
  quand: '2026-09-11T12:00:00.123456Z',
  precedent: null,
  precedent_email: null,
  suivant: randomUUID(),
  suivant_email: 'collaborateur@example.invalid',
  auteur: null,
  auteur_email: null,
})
test('le curseur conserve le dossier, le type et les microsecondes', () => {
  const lignes = Array.from({ length: 51 }, ligne),
    p = pageResponsables(lignes, dossier)
  expect(p.lignes).toHaveLength(50)
  expect(lirePositionResponsables(p.suivant, dossier)).toEqual({
    id: lignes[49]!.id,
    quand: lignes[49]!.quand,
  })
  expect(lirePositionResponsables(p.suivant, randomUUID())).toBeNull()
  expect(pageResponsables(lignes.slice(0, 50), dossier).suivant).toBeNull()
})
test.each([
  null,
  [],
  {},
  '../',
  'a'.repeat(513),
  Buffer.from(JSON.stringify([dossier, '2026-09-11T12:00:00Z', randomUUID()])).toString(
    'base64url',
  ),
])('un curseur invalide revient au debut %#', (valeur) => {
  expect(lirePositionResponsables(valeur, dossier)).toBeNull()
})
test.each([
  null,
  {},
  [{ ...ligne(), montant: 900 }],
  Array.from({ length: 52 }, ligne),
  [{ ...ligne(), quand: 'invalide' }],
])('un resultat non conforme est refuse %#', (valeur) => {
  expect(() => pageResponsables(valeur, dossier)).toThrow()
})
async function rendre(data: unknown, error: unknown = null) {
  const rpc = async (nom: string, args: unknown) => {
    expect(nom).toBe('historique_responsables_du_dossier')
    expect(args).toEqual({ le_dossier: dossier, avant_quand: null, avant_id: null })
    return { data, error }
  }
  return renderToStaticMarkup(
    await HistoriqueResponsables({
      dossierId: dossier,
      supabase: { rpc } as unknown as SupabaseClient,
      position: undefined,
    }),
  )
}
test('un contenu hostile est affiche comme texte et les UUID internes ne sont pas rendus', async () => {
  const l = { ...ligne(), suivant_email: '<script>intrusion</script>' },
    html = await rendre([l])
  expect(html).toContain('&lt;script&gt;intrusion&lt;/script&gt;')
  expect(html).not.toContain('<script>intrusion')
  expect(html).not.toContain(l.suivant)
  expect(html).toContain('Administration technique')
  expect(html).toContain('Non attribué')
})
test('les comptes disparus ne sont pas remplaces par leur ancien identifiant', async () => {
  const l = { ...ligne(), suivant_email: null },
    html = await rendre([l])
  expect(html).toContain('Ancien collaborateur ou compte indisponible')
  expect(html).not.toContain(l.suivant)
})
test('une panne ne diffuse pas le detail SQL et ne presente pas un historique vide', async () => {
  const html = await rendre(null, { message: 'detail interne confidentiel' })
  expect(html).toContain('momentanément indisponible')
  expect(html).not.toContain('detail interne confidentiel')
  expect(html).not.toContain('Aucun changement enregistré')
})
test('une reponse portant une erreur ne montre pas ses donnees partielles', async () => {
  const html = await rendre([ligne()], { message: 'panne' })
  expect(html).toContain('momentanément indisponible')
  expect(html).not.toContain('collaborateur@example.invalid')
})
test('un curseur provenant d un autre type d historique est refuse', () => {
  const autre = Buffer.from(
    JSON.stringify(['autre-v1', dossier, ligne().quand, randomUUID()]),
  ).toString('base64url')
  expect(lirePositionResponsables(autre, dossier)).toBeNull()
})
