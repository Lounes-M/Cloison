import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  contexte: vi.fn(),
  session: vi.fn(),
  porteur: vi.fn(),
  serveur: vi.fn(),
  ouvrir: vi.fn(),
  livrer: vi.fn(),
  debit: vi.fn(),
  rpc: vi.fn(),
  prevenir: vi.fn(),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: h.contexte }))
vi.mock('@/lib/acces/session', () => ({
  capaciteDepuisCookies: h.session,
  clientPorteurDeLien: h.porteur,
  ouvrirDossierAvecLien: h.ouvrir,
}))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.serveur }))
vi.mock('@/lib/acces/debit', () => ({ consommerDebit: h.debit }))
vi.mock('@/lib/courriels/livraison-liens', () => ({ reprendreLivraisonLiens: h.livrer }))
vi.mock('@/lib/courriels/notifications', () => ({ prevenirSiLeStatutAChange: h.prevenir }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

import { reglerLaCandidature } from '@/lib/agences/action-logements'
import { candidature } from '@/lib/content/candidature'
import { candidaterAuLogement } from '@/lib/locataire/action-candidature'
import { ouvrirMonDossier } from '@/lib/locataire/action-ouverture'
import { codeDeCandidature } from '@/lib/validation/candidature'

const DOSSIER = '11111111-1111-4111-8111-111111111111'
const LOGEMENT = '22222222-2222-4222-8222-222222222222'
const CODE = '0123456789abcdef0123456789abcdef'

const form = (v: Record<string, string>) => {
  const f = new FormData()
  for (const [k, x] of Object.entries(v)) f.set(k, x)
  return f
}

beforeEach(() => {
  h.rpc.mockResolvedValue({ data: 'Agence Fictive', error: null })
  h.contexte.mockResolvedValue({ etat: 'rattache', supabase: { rpc: h.rpc } })
  h.porteur.mockReturnValue({ rpc: h.rpc })
  h.serveur.mockResolvedValue({ rpc: h.rpc })
  h.session.mockResolvedValue({
    jeton: 'jeton',
    capacite: { partie: 'locataire', dossierId: DOSSIER },
  })
  h.debit.mockResolvedValue(true)
  h.ouvrir.mockResolvedValue({ dossierId: DOSSIER })
})
afterEach(() => vi.resetAllMocks())

test('le code se lit depuis le lien complet ou seul, et rien d autre', () => {
  expect(codeDeCandidature(CODE)).toBe(CODE)
  expect(codeDeCandidature(` https://cloison.fr/candidater/${CODE.toUpperCase()}?utm=x `)).toBe(
    CODE,
  )
  expect(codeDeCandidature(`https://cloison.fr/autre/${CODE}`)).toBeNull()
  expect(codeDeCandidature(CODE.slice(1))).toBeNull()
  expect(codeDeCandidature('')).toBeNull()
})

test("l'agence ouvre ou ferme le lien par la fonction de la base", async () => {
  await reglerLaCandidature(form({ logement: LOGEMENT, candidature: 'ouvrir' }))
  await reglerLaCandidature(form({ logement: LOGEMENT, candidature: 'fermer' }))
  expect(h.rpc.mock.calls).toEqual([
    ['regler_candidature_logement', { le_logement: LOGEMENT, ouvrir: true }],
    ['regler_candidature_logement', { le_logement: LOGEMENT, ouvrir: false }],
  ])
  await reglerLaCandidature(form({ logement: 'pas-un-id', candidature: 'ouvrir' }))
  h.contexte.mockResolvedValue({ etat: 'anonyme' })
  await reglerLaCandidature(form({ logement: LOGEMENT, candidature: 'ouvrir' }))
  expect(h.rpc).toHaveBeenCalledTimes(2)
})

test('le locataire candidate avec son accord, depuis son propre dossier', async () => {
  const initial = { statut: 'inactif' } as const
  expect(
    await candidaterAuLogement(
      initial,
      form({ dossier: DOSSIER, code: `https://x.fr/candidater/${CODE}`, accord: 'on' }),
    ),
  ).toEqual({ statut: 'transmis', agence: 'Agence Fictive' })
  expect(h.porteur).toHaveBeenCalledWith('jeton')
  expect(h.rpc).toHaveBeenCalledExactlyOnceWith('candidater_au_logement', { le_code: CODE })
  expect(h.prevenir).toHaveBeenCalledExactlyOnceWith({ rpc: h.rpc }, DOSSIER, null)

  h.rpc.mockClear()
  expect(await candidaterAuLogement(initial, form({ dossier: DOSSIER, code: CODE }))).toEqual({
    statut: 'erreur',
    message: candidature.espace.accord,
  })
  expect(
    await candidaterAuLogement(initial, form({ dossier: DOSSIER, code: 'abc', accord: 'on' })),
  ).toEqual({ statut: 'erreur', message: candidature.espace.erreur })
  expect(
    (await candidaterAuLogement(initial, form({ dossier: LOGEMENT, code: CODE, accord: 'on' })))
      .statut,
  ).toBe('erreur')
  h.session.mockResolvedValue({ jeton: 'j', capacite: { partie: 'garant', dossierId: DOSSIER } })
  expect(
    (await candidaterAuLogement(initial, form({ dossier: DOSSIER, code: CODE, accord: 'on' })))
      .statut,
  ).toBe('erreur')
  expect(h.rpc).not.toHaveBeenCalled()

  h.session.mockResolvedValue({ jeton: 'j', capacite: { partie: 'locataire', dossierId: DOSSIER } })
  h.rpc.mockResolvedValue({ data: null, error: { message: 'Candidature indisponible.' } })
  expect(
    await candidaterAuLogement(initial, form({ dossier: DOSSIER, code: CODE, accord: 'on' })),
  ).toEqual({ statut: 'erreur', message: candidature.espace.erreur })
})

test('un dossier ouvert depuis le lien rejoint le logement avant l envoi du lien', async () => {
  const initial = { statut: 'inactif' } as const
  const ordre: string[] = []
  h.rpc.mockImplementation(async (nom: string) => {
    ordre.push(nom)
    return { data: 'Agence Fictive', error: null }
  })
  h.livrer.mockImplementation(async () => void ordre.push('livraison'))
  expect(
    await ouvrirMonDossier(
      initial,
      form({ courriel: 'toi@exemple.fr', candidature: CODE, accord: 'on' }),
    ),
  ).toEqual({ statut: 'envoye', candidature: 'rattachee' })
  expect(h.rpc).toHaveBeenCalledWith('candidater_dossier_neuf', {
    le_dossier: DOSSIER,
    le_code: CODE,
  })
  expect(ordre).toEqual(['candidater_dossier_neuf', 'livraison'])
  expect(h.prevenir).toHaveBeenCalledExactlyOnceWith({ rpc: h.rpc }, DOSSIER, null)
})

test('sans accord, ou avec un code mal forme, aucun dossier ne s ouvre', async () => {
  const initial = { statut: 'inactif' } as const
  expect(
    await ouvrirMonDossier(initial, form({ courriel: 'toi@exemple.fr', candidature: CODE })),
  ).toMatchObject({ statut: 'erreur', message: candidature.erreurs.accord })
  expect(
    (
      await ouvrirMonDossier(
        initial,
        form({ courriel: 'toi@exemple.fr', candidature: 'x', accord: 'on' }),
      )
    ).statut,
  ).toBe('erreur')
  expect(h.ouvrir).not.toHaveBeenCalled()
})

test('un rattachement refuse laisse le dossier ouvert et le dit', async () => {
  const initial = { statut: 'inactif' } as const
  h.rpc.mockResolvedValue({ data: null, error: { message: 'Candidature indisponible.' } })
  expect(
    await ouvrirMonDossier(
      initial,
      form({ courriel: 'toi@exemple.fr', candidature: CODE, accord: 'on' }),
    ),
  ).toEqual({ statut: 'envoye', candidature: 'echouee' })
  expect(h.livrer).toHaveBeenCalledWith(DOSSIER)
  expect(h.prevenir).not.toHaveBeenCalled()
  expect(await ouvrirMonDossier(initial, form({ courriel: 'toi@exemple.fr' }))).toEqual({
    statut: 'envoye',
  })
})
