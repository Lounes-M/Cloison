import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { observerPurge, signalerPurge } from '@/lib/exploitation/diagnostic-purge'
import { purgerCoffres } from '@/lib/exploitation/purge'
import type { SupabaseClient } from '@supabase/supabase-js'

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())
const prive = 'IDENTITE_PRIVEE cle-secrete chemin/document.pdf'

test.each([
  ['PGRST202', 'fonction_introuvable'],
  ['PGRST003', 'connexions_saturees'],
  ['42501', 'droits_refuses'],
  ['57014', 'requete_annulee'],
  [prive, 'appel_indisponible'],
])('classe %s sans restituer les details fournisseur', async (code, raison) => {
  const retour = { data: null, error: { code, message: prive, details: prive, hint: prive } }
  expect(await observerPurge('brouillons', async () => retour)).toBe(retour)
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    '[purge] etape en echec',
    'brouillons',
    raison,
  )
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(prive)
})
test('une exception est propagee sans son message dans le diagnostic', async () => {
  const erreur = new Error(prive)
  await expect(
    observerPurge('file', async () => {
      throw erreur
    }),
  ).rejects.toBe(erreur)
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    '[purge] etape en echec',
    'file',
    'appel_indisponible',
  )
})
test('le budget interrompu prime sans journaliser sa raison privee', async () => {
  const controleur = new AbortController()
  controleur.abort(prive)
  await observerPurge(
    'suivi',
    async () => ({ error: { code: 'PGRST202', message: prive } }),
    controleur.signal,
  )
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    '[purge] etape en echec',
    'suivi',
    'budget_epuise',
  )
})
test('un succes ne produit aucun diagnostic', async () => {
  const retour = { data: 0, error: null }
  expect(await observerPurge('coffre', async () => retour)).toBe(retour)
  expect(console.error).not.toHaveBeenCalled()
})
test('un compteur invalide est distingue', () => {
  signalerPurge('responsables', null, undefined, true)
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    '[purge] etape en echec',
    'responsables',
    'resultat_invalide',
  )
})
test.each(['erreur', 'invalide', 'exception'])(
  'un echec %s des brouillons reste un echec de purge identifie',
  async (cas) => {
    const rpc = vi.fn(async (nom: string) => {
      if (nom !== 'purger_brouillons_engagement') return { data: 0, error: null }
      if (cas === 'exception') throw new Error(prive)
      return cas === 'erreur'
        ? { data: null, error: { code: 'PGRST202', message: prive } }
        : { data: prive, error: null }
    })
    const db = {
      rpc,
      from: () => ({
        select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      }),
    } as unknown as SupabaseClient
    expect(await purgerCoffres(db)).toEqual({ traites: 0, echecs: 1 })
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[purge] etape en echec',
      'brouillons',
      cas === 'erreur'
        ? 'fonction_introuvable'
        : cas === 'invalide'
          ? 'resultat_invalide'
          : 'appel_indisponible',
    )
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(prive)
  },
)

test.each([502, 503, 504, 429])(
  'identifie HTTP %s sans exposer le corps de la passerelle',
  async (status) => {
    await observerPurge('reprise', async () => ({ error: { message: prive }, status }))
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[purge] etape en echec',
      'reprise',
      status === 429 ? 'limite_fournisseur' : 'passerelle_indisponible',
    )
  },
)

test('le code de saturation precise un HTTP 504', async () => {
  await observerPurge('reprise', async () => ({
    error: { code: 'PGRST003', message: prive },
    status: 504,
  }))
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    '[purge] etape en echec',
    'reprise',
    'connexions_saturees',
  )
})
