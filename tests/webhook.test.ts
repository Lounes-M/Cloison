import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { reponseAuMarquage } from '@/lib/paiement/webhook'

/**
 * Ce qu'on repond a Stripe, et ou tournent nos fonctions.
 *
 * Deux garde-fous d'exploitation. Le premier : un paiement encaisse pendant
 * une panne de notre cote ne doit pas etre perdu, donc Stripe doit revenir.
 * Le second : la cle maitresse s'execute la ou tournent les fonctions, et ce
 * lieu doit rester en Europe.
 */

describe('la reponse au webhook Stripe', () => {
  test('un dossier marque : 200, et Stripe ne revient pas', () => {
    expect(reponseAuMarquage({ data: true, error: null })).toEqual({
      statut: 200,
      corps: { recu: true, marque: true },
    })
  })

  test('un dossier introuvable, purge entre-temps : 200, rejouer n y changerait rien', () => {
    expect(reponseAuMarquage({ data: false, error: null })).toEqual({
      statut: 200,
      corps: { recu: true, marque: false },
    })
  })

  test('une anomalie definitive, deux references pour un dossier : 200, elle se lit dans les journaux', () => {
    const reponse = reponseAuMarquage({
      data: null,
      error: { code: '23505', message: 'Dossier deja regle avec une autre reference.' },
    })
    expect(reponse.statut).toBe(200)
    expect(reponse.corps).toEqual({ recu: true, marque: false, anomalie: true })
  })

  test('un echec passager : 503, pour que Stripe revienne', () => {
    for (const error of [
      { code: null, message: 'fetch failed' },
      { code: '42501', message: 'permission denied for function marquer_dossier_paye' },
      { code: '57014', message: 'canceling statement due to statement timeout' },
      { message: 'reseau coupe' },
    ]) {
      const reponse = reponseAuMarquage({ data: null, error })
      expect(reponse.statut, error.message).toBe(503)
      expect(reponse.corps).toEqual({ recu: false })
    }
  })
})

describe('la region des fonctions', () => {
  test('les fonctions tournent en Europe, et nulle part ailleurs', () => {
    // La cle maitresse dechiffre les pieces la ou la fonction s'execute. Le
    // registre des traitements dit l'Union europeenne : le fichier de
    // deploiement doit le tenir, pas un reglage clique dans un tableau de bord.
    const config = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'vercel.json'), 'utf8'))
    const europeennes = new Set(['fra1', 'cdg1', 'arn1', 'dub1', 'lhr1'])
    expect(config.regions.length).toBeGreaterThan(0)
    for (const region of config.regions) expect(europeennes.has(region), region).toBe(true)
  })
})

for (const data of [null, undefined, 'true', 1]) {
  test(`une confirmation ambigue ${String(data)} reste rejouable`, () => {
    expect(reponseAuMarquage({ data, error: null })).toEqual({
      statut: 503,
      corps: { recu: false },
    })
  })
}
