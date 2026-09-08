import { beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  session: vi.fn(),
  client: vi.fn(),
  notification: vi.fn(),
  serveur: vi.fn(),
  document: vi.fn(),
  paiement: vi.fn(),
  analyse: vi.fn(),
}))
vi.mock('@/lib/acces/session', () => ({
  capaciteDepuisCookies: h.session,
  clientPorteurDeLien: h.client,
  urlDuLien: vi.fn(),
}))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.serveur }))
vi.mock('@/lib/garant/debit-depot', () => ({ autoriserAnalyse: h.analyse }))
vi.mock('@/lib/coffre/validation-document', () => ({ verifierDocument: h.document }))
vi.mock('@/lib/courriels/notifications', () => ({
  statutActuel: async () => 'ouvert',
  prevenirSiLeStatutAChange: h.notification,
}))
vi.mock('@/lib/paiement/stripe', () => ({ creerSessionLocataire: h.paiement }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { declarerMonEngagement } from '@/lib/garant/action-engagement'
import { apposerMaMention } from '@/lib/garant/action-mention'
import { deposerUnePiece, retirerUnePiece } from '@/lib/garant/action-depot'
import { saisirMonLoyer } from '@/lib/locataire/action-loyer'
import { designerMonGarant } from '@/lib/locataire/action-garant'
import { rattacherMonDossier } from '@/lib/locataire/action-continuite'
import { payerMonDossier } from '@/lib/locataire/action-paiement'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const initial = { statut: 'inactif' } as const
function formulaire(dossier = A) {
  const f = new FormData()
  Object.entries({
    dossier,
    versionConditions: '1',
    couvre: 'loyer',
    montant: '12000',
    revenu: '3200',
    loyer: '800',
    courriel: 'garant@example.fr',
    domaine: 'agence.fr',
    accord: 'on',
    nom: 'Fixture',
    prenom: 'Alice',
    adresse: '1 rue des essais',
    mention: 'caution, payer en cas de defaillance, douze mille euros (12000 euros)',
    nature: 'piece_identite',
    piece: A,
  }).forEach(([k, v]) => f.set(k, v))
  f.set('fichier', new File(['%PDF-1.7\n'], 'essai.pdf', { type: 'application/pdf' }))
  return f
}
beforeEach(() => {
  vi.clearAllMocks()
  h.client.mockImplementation(() => {
    throw new Error('Le client ne doit pas etre construit')
  })
})

for (const action of [declarerMonEngagement, apposerMaMention]) {
  test.each(['', '-1', '2.5', '2147483648'])(
    'refuse une version de formulaire invalide %s',
    async (version) => {
      h.session.mockResolvedValue({
        jeton: 'fixture',
        capacite: { dossierId: A, partie: 'garant' },
      })
      const f = formulaire()
      f.set('versionConditions', version)
      expect((await action(initial, f)).statut).toBe('erreur')
      expect(h.client).not.toHaveBeenCalled()
    },
  )
  test('refuse des conditions modifiees dans un autre onglet avant toute ecriture', async () => {
    h.session.mockResolvedValue({ jeton: 'fixture', capacite: { dossierId: A, partie: 'garant' } })
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: {
          dossier_id: A,
          version_conditions: 2,
          solidaire: false,
          montant_max_cents: 1200000,
        },
        error: null,
      })),
    }
    h.client.mockReturnValue({ from: () => q })
    expect((await action(initial, formulaire())).statut).toBe('erreur')
    expect(q.update).not.toHaveBeenCalled()
  })
  test('la mise a jour atomique conserve le filtre de version', async () => {
    h.session.mockResolvedValue({ jeton: 'fixture', capacite: { dossierId: A, partie: 'garant' } })
    let ecrit = false
    let filtre = false
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((colonne: string, valeur: unknown) => {
        if (ecrit && colonne === 'version_conditions' && valeur === 1) filtre = true
        return q
      }),
      update: vi.fn(() => {
        ecrit = true
        return q
      }),
      maybeSingle: vi.fn(async () => ({
        data:
          ecrit && filtre
            ? null
            : {
                dossier_id: A,
                version_conditions: 1,
                solidaire: false,
                montant_max_cents: 1200000,
              },
        error: null,
      })),
    }
    h.client.mockReturnValue({ from: () => q })
    expect((await action(initial, formulaire())).statut).toBe('erreur')
    expect(filtre).toBe(true)
  })
}

for (const [nom, partie, action] of [
  ['engagement', 'garant', declarerMonEngagement],
  ['mention', 'garant', apposerMaMention],
  ['depot', 'garant', deposerUnePiece],
  ['retrait', 'garant', retirerUnePiece],
  ['loyer', 'locataire', saisirMonLoyer],
  ['garant', 'locataire', designerMonGarant],
] as const) {
  test.each([A, ''])(
    `${nom} refuse le formulaire d'un autre dossier ou sans dossier (%s)`,
    async (dossier) => {
      h.session.mockResolvedValue({ jeton: 'fixture', capacite: { dossierId: B, partie } })
      const resultat = await action(initial, formulaire(dossier))
      expect(resultat.statut).toBe('erreur')
      expect(h.client).not.toHaveBeenCalled()
      expect(h.serveur).not.toHaveBeenCalled()
      expect(h.document).not.toHaveBeenCalled()
    },
  )
}
test('rattachement refuse le dossier ouvert dans un autre onglet', async () => {
  h.session.mockResolvedValue({ jeton: 'fixture', capacite: { dossierId: B, partie: 'locataire' } })
  await rattacherMonDossier({}, formulaire())
  expect(h.client).not.toHaveBeenCalled()
})
test('paiement refuse le dossier ouvert dans un autre onglet', async () => {
  h.session.mockResolvedValue({ jeton: 'fixture', capacite: { dossierId: B, partie: 'locataire' } })
  await expect(payerMonDossier(formulaire())).rejects.toThrow('REDIRECT:/lien-invalide')
  expect(h.client).not.toHaveBeenCalled()
  expect(h.paiement).not.toHaveBeenCalled()
})

test.each(
  ['engagement', 'mention', 'loyer'].flatMap((nom) =>
    [false, true].map((confirme) => ({ nom, confirme })),
  ),
)('$nom confirme seulement une ligne retournee (confirme=$confirme)', async ({ nom, confirme }) => {
  h.session.mockResolvedValue({
    jeton: 'fixture',
    capacite: { dossierId: A, partie: nom === 'loyer' ? 'locataire' : 'garant' },
  })
  const lecture = {
    dossier_id: A,
    solidaire: false,
    montant_max_cents: 1200000,
    version_conditions: 1,
  }
  let ecriture = false
  const q = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn(() => {
      ecriture = true
      return q
    }),
    maybeSingle: vi.fn(async () => ({ data: ecriture && !confirme ? null : lecture, error: null })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  }
  h.client.mockReturnValue({ from: () => q })
  const action =
    nom === 'engagement'
      ? declarerMonEngagement
      : nom === 'mention'
        ? apposerMaMention
        : saisirMonLoyer
  expect((await action(initial, formulaire())).statut).toBe(
    confirme ? (nom === 'mention' ? 'apposee' : 'enregistre') : 'erreur',
  )
  if (!confirme) expect(h.notification).not.toHaveBeenCalled()
})

test('un quota refuse empeche meme la lecture des octets du depot', async () => {
  h.session.mockResolvedValue({ jeton: 'fixture', capacite: { dossierId: A, partie: 'garant' } })
  h.analyse.mockResolvedValue(false)
  h.client.mockReturnValue({})
  const f = formulaire()
  const octets = vi.spyOn(f.get('fichier') as File, 'arrayBuffer')
  expect((await deposerUnePiece(initial, f)).statut).toBe('erreur')
  expect(h.analyse).toHaveBeenCalledWith(A)
  expect(octets).not.toHaveBeenCalled()
  expect(h.document).not.toHaveBeenCalled()
  expect(h.client).not.toHaveBeenCalled()
})
