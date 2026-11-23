import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  cleSirenValide,
  controlerSiren,
  lignesControleSiren,
  nomsProches,
} from '@/lib/agences/controle-siren'

/**
 * Le controle du SIREN sur l'annuaire des entreprises.
 *
 * Aucun appel reel : l'annuaire est une doublure, et ce qu'on verifie est ce
 * que l'exploitant lira. Une panne ne doit jamais devenir une erreur, et un
 * resultat voisin ne doit jamais passer pour l'entreprise declaree.
 */

const SIREN = '552032534'

const unite = (surcharge: Record<string, unknown> = {}) => ({
  siren: SIREN,
  nom_complet: 'AGENCE DU PARC LYON 3 (PARC IMMO)',
  nom_raison_sociale: 'AGENCE DU PARC LYON 3',
  sigle: null,
  activite_principale: '68.31Z',
  etat_administratif: 'A',
  date_creation: '2011-04-01',
  date_fermeture: null,
  siege: { libelle_commune: 'LYON', liste_enseignes: ['PARC IMMO'], nom_commercial: null },
  ...surcharge,
})

const annuaire = (results: unknown[]) => {
  const appel = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results })))
  vi.stubGlobal('fetch', appel)
  return appel
}

afterEach(() => vi.unstubAllGlobals())

describe('la cle du SIREN', () => {
  test.each(['552032534', '356000000', '732829320'])('%s est bien forme', (siren) => {
    expect(cleSirenValide(siren)).toBe(true)
  })

  test.each(['552032535', '123456789', '12345678', 'ABCDEFGHI'])('%s ne l est pas', (siren) => {
    expect(cleSirenValide(siren)).toBe(false)
  })
})

describe('la ressemblance des noms', () => {
  test('un mot distinctif commun suffit, sans accents ni casse', () => {
    expect(nomsProches('Agence du Pârc', ['AGENCE DU PARC LYON 3'])).toBe(true)
    expect(nomsProches('Parc Immo', ['SAS DUPONT', 'PARC IMMO'])).toBe(true)
  })

  test('les mots que toutes les agences portent ne comptent pas', () => {
    expect(nomsProches('Agence Immobilière Martin', ['AGENCE IMMOBILIERE DURAND'])).toBe(false)
    expect(nomsProches('Agence Immobilière', ['AGENCE IMMOBILIERE DURAND'])).toBe(false)
  })
})

describe('controler un SIREN', () => {
  test('seul le SIREN part, vers l annuaire de l Etat', async () => {
    const appel = annuaire([unite()])
    await controlerSiren(SIREN, 'Agence du Parc')

    expect(appel).toHaveBeenCalledTimes(1)
    const url = new URL(String(appel.mock.calls[0]![0]))
    expect(url.origin).toBe('https://recherche-entreprises.api.gouv.fr')
    expect(url.searchParams.get('q')).toBe(SIREN)
    expect(url.href).not.toContain('Parc')
  })

  test('une agence immobiliere en activite, au nom proche', async () => {
    annuaire([unite()])
    expect(await controlerSiren(SIREN, 'Agence du Parc')).toEqual({
      etat: 'trouve',
      nom: 'AGENCE DU PARC LYON 3 (PARC IMMO)',
      enActivite: true,
      fermeeLe: null,
      creeeLe: '2011-04-01',
      activite: '68.31Z',
      activiteImmobiliere: true,
      commune: 'LYON',
      nomProche: true,
    })
  })

  test('une entreprise cessee, d une autre activite et d un autre nom, est signalee', async () => {
    annuaire([
      unite({
        nom_complet: 'BOULANGERIE DURAND',
        nom_raison_sociale: 'BOULANGERIE DURAND',
        activite_principale: '10.71C',
        etat_administratif: 'C',
        date_fermeture: '2024-06-30',
        siege: { libelle_commune: 'NANTES' },
      }),
    ])
    const controle = await controlerSiren(SIREN, 'Agence du Parc')
    expect(controle).toMatchObject({
      enActivite: false,
      fermeeLe: '2024-06-30',
      activiteImmobiliere: false,
      nomProche: false,
    })
    const lignes = lignesControleSiren(controle).join('\n')
    expect(lignes).toContain('[!]  Cessee le 2024-06-30')
    expect(lignes).toContain('pas une activite immobiliere')
    expect(lignes).toContain('ne ressemble pas')
  })

  test('un resultat voisin n est pas l entreprise declaree', async () => {
    annuaire([unite({ siren: '356000000' })])
    expect(await controlerSiren(SIREN, 'Agence du Parc')).toEqual({
      etat: 'introuvable',
      cleValide: true,
    })
  })

  test('un numero inconnu a la cle fausse est donne pour une faute de frappe', async () => {
    annuaire([])
    const controle = await controlerSiren('123456789', 'Agence du Parc')
    expect(controle).toEqual({ etat: 'introuvable', cleValide: false })
    expect(lignesControleSiren(controle).join('\n')).toContain('faute de frappe')
  })

  test.each([
    ['une panne reseau', () => Promise.reject(new Error('reseau'))],
    ['un refus', () => Promise.resolve(new Response('trop de requetes', { status: 429 }))],
    ['une reponse illisible', () => Promise.resolve(new Response('<html>'))],
    ['une forme inattendue', () => Promise.resolve(new Response(JSON.stringify({ erreur: 1 })))],
  ])('%s donne « indisponible », jamais une erreur', async (_cas, reponse) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(reponse))
    const controle = await controlerSiren(SIREN, 'Agence du Parc')
    expect(controle).toEqual({ etat: 'indisponible' })
    expect(lignesControleSiren(controle).join('\n')).toContain('a verifier a la main')
  })

  test('un SIREN mal forme ne part pas', async () => {
    const appel = annuaire([])
    expect(await controlerSiren('12345', 'Agence du Parc')).toEqual({ etat: 'indisponible' })
    expect(appel).not.toHaveBeenCalled()
  })

  test('le courriel rappelle ce que l annuaire ne dit pas', async () => {
    annuaire([unite()])
    const lignes = lignesControleSiren(await controlerSiren(SIREN, 'Agence du Parc')).join('\n')
    expect(lignes).toContain('[ok] Existe : AGENCE DU PARC LYON 3 (PARC IMMO), LYON')
    expect(lignes).toContain('[ok] En activite')
    expect(lignes).toContain('[ok] Activite 68.31Z : immobiliere')
    expect(lignes).toContain('carte professionnelle')
  })
})
