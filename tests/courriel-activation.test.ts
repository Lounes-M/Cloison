import { beforeEach, expect, test, vi } from 'vitest'

const envoyer = vi.hoisted(() => vi.fn())
vi.mock('@/lib/courriels/envoi', () => ({ envoyer }))
vi.mock('@/lib/env', () => ({ env: { emailDestinataire: 'exploitant@exemple.fr' } }))

import { notifierDemandeActivation } from '@/lib/courriels/activation'

const demande = {
  agenceId: '00000000-0000-0000-0000-000000000001',
  nom: 'Agence du Parc',
  domaine: 'agence-du-parc.fr',
  siren: '552032534',
  cartePro: 'CPI 6901 2026 000 000 001',
  demandeePar: 'marie@agence-du-parc.fr',
  essais: { consultations: 3, piecesOuvertes: 2, dossiersPris: 1 },
}

beforeEach(() => envoyer.mockReset().mockResolvedValue(true))

test('le controle du SIREN figure dans le courriel de l exploitant, avant le lien et le SQL', async () => {
  await notifierDemandeActivation({
    ...demande,
    controleSiren: { etat: 'introuvable', cleValide: false },
  })
  const corps = String(envoyer.mock.calls[0]![2])
  expect(envoyer.mock.calls[0]![0]).toBe('exploitant@exemple.fr')
  expect(corps).toContain('Aucune entreprise a ce numero')
  expect(corps.indexOf('Controle automatique')).toBeLessThan(corps.indexOf('Verifier le SIREN'))
  expect(corps).toContain("set statut = 'verifiee'")
})

test('sans controle, le courriel part comme avant', async () => {
  expect(await notifierDemandeActivation(demande)).toBe(true)
  const corps = String(envoyer.mock.calls[0]![2])
  expect(corps).not.toContain('Controle automatique')
  expect(corps).toContain('https://annuaire-entreprises.data.gouv.fr/entreprise/552032534')
})
