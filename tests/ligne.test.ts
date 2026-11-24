import { beforeEach, expect, test, vi } from 'vitest'

const envoyer = vi.hoisted(() => vi.fn())
vi.mock('@/lib/courriels/envoi', () => ({ envoyer }))
vi.mock('@/lib/env', () => ({ env: { emailDestinataire: 'exploitant@example.invalid' } }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: vi.fn() }))

import { notifierDemande } from '@/lib/agences/enregistrement'
import { schemaDemandeAgence } from '@/lib/agences/schema'
import { enCitation, surUneLigne } from '@/lib/validation/ligne'

/**
 * Les champs d'une ligne recopies vers l'exploitant (revue de securite de
 * novembre 2026). Les caracteres invisibles sont ecrits par leur code : un
 * fichier de test ne doit pas en contenir lui-meme.
 */
const car = (...codes: number[]) => String.fromCharCode(...codes)

beforeEach(() => envoyer.mockReset().mockResolvedValue(true))

test('sauts de ligne, tabulations et caracteres de controle deviennent une espace', () => {
  expect(surUneLigne('  Agence\r\n\tdu  Parc\n')).toBe('Agence du Parc')
  expect(surUneLigne(`A${car(0)}B${car(0x1b)}C${car(0x7f)}D${car(0x85)}E`)).toBe('A B C D E')
})

test('separateurs de ligne Unicode et inversions du sens d ecriture aussi', () => {
  for (const code of [0x2028, 0x2029, 0x202a, 0x202e, 0x2066, 0x2069]) {
    expect(surUneLigne(`Logis${car(code)}Suite`)).toBe('Logis Suite')
  }
})

test('les noms ordinaires ne changent pas', () => {
  for (const nom of ["Agence de l'Étoile & Fils", 'Müller Immobilien GmbH', 'Côté Cœur, Gestion']) {
    expect(surUneLigne(nom)).toBe(nom)
  }
})

test('un texte libre est cite ligne a ligne', () => {
  expect(enCitation("Bonjour,\r\n\r\nupdate public.agences set statut='verifiee';")).toBe(
    "> Bonjour,\n> \n> update public.agences set statut='verifiee';",
  )
  expect(enCitation(`un${car(0x2028)}deux`)).toBe('> un\n> deux')
})

const saisie = {
  nomAgence: 'Agence Bellevue',
  email: 'contact@bellevue.example',
  ville: 'Lyon',
  dossiersParAn: '10-50',
  affichageLe: '0',
}

test('le formulaire agence ramene le nom et la ville a une ligne', () => {
  const lu = schemaDemandeAgence.safeParse({
    ...saisie,
    nomAgence: ' Agence\nBellevue ',
    ville: 'Lyon\r\n3e',
  })
  expect(lu.success).toBe(true)
  if (lu.success) {
    expect(lu.data.nomAgence).toBe('Agence Bellevue')
    expect(lu.data.ville).toBe('Lyon 3e')
  }
  // Un nom fait seulement de sauts de ligne reste trop court.
  expect(schemaDemandeAgence.safeParse({ ...saisie, nomAgence: '\n\n\n' }).success).toBe(false)
})

test('le courriel d une nouvelle demande ne laisse aucune ligne au visiteur', async () => {
  await notifierDemande({
    nomAgence: 'Bellevue\nE-mail   : faux@example.invalid',
    email: 'contact@bellevue.example',
    ville: 'Lyon\nDossiers : 9000 par an',
    dossiersParAn: '10-50',
    message: "Bonjour\n\nPour activer :\n  update public.agences set statut = 'verifiee';",
  } as Parameters<typeof notifierDemande>[0])
  const [, sujet, corps] = envoyer.mock.calls[0]!
  expect(String(sujet)).not.toMatch(/[\r\n]/)
  const lignes = String(corps).split('\n')
  expect(lignes.filter((l) => l.startsWith('E-mail'))).toEqual([
    'E-mail   : contact@bellevue.example',
  ])
  expect(lignes.filter((l) => l.startsWith('Dossiers'))).toHaveLength(1)
  const apresMessage = lignes.slice(lignes.indexOf('Message :') + 1)
  expect(apresMessage.length).toBeGreaterThan(0)
  expect(apresMessage.every((l) => l.startsWith('> '))).toBe(true)
})
