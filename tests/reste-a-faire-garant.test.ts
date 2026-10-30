import { expect, test } from 'vitest'
import { resteAFaire } from '@/lib/garant/reste-a-faire'

const declare = { revenuDeclare: true, montantDeclare: true, mentionApposee: true }
const communes = [
  { id: 'a', type: 'avis_imposition' },
  { id: 'b', type: 'piece_identite' },
  { id: 'c', type: 'justificatif_domicile' },
]

test('un garant qui arrive voit son engagement puis chaque piece attendue', () => {
  const etapes = resteAFaire({
    profil: 'salarie',
    engagement: null,
    pieces: [],
    demandes: [],
    mentionAttendue: false,
  })
  expect(etapes.map((e) => (e.sorte === 'piece' ? e.nature : e.sorte))).toEqual([
    'engagement',
    'bulletin_paie',
    'avis_imposition',
    'piece_identite',
    'justificatif_domicile',
  ])
})

test('les bulletins se comptent en documents declares, pas en fichiers', () => {
  const etapes = resteAFaire({
    profil: 'salarie',
    engagement: declare,
    pieces: [...communes, { id: 'd', type: 'bulletin_paie', nombre_documents: 2 }],
    demandes: [],
    mentionAttendue: true,
  })
  expect(etapes).toEqual([
    {
      sorte: 'piece',
      nature: 'bulletin_paie',
      libelle: 'Bulletins de paie',
      manque: 1,
      attendu: 3,
    },
  ])
})

test('une attestation de ressources remplace les deux bilans', () => {
  const sans = resteAFaire({
    profil: 'independant',
    engagement: declare,
    pieces: [...communes, { id: 'e', type: 'activite_independante' }],
    demandes: [],
    mentionAttendue: false,
  })
  expect(sans.map((e) => e.sorte === 'piece' && e.nature)).toEqual(['bilan_comptable'])
  const avec = resteAFaire({
    profil: 'independant',
    engagement: declare,
    pieces: [
      ...communes,
      { id: 'e', type: 'activite_independante' },
      { id: 'f', type: 'attestation_ressources' },
    ],
    demandes: [],
    mentionAttendue: false,
  })
  expect(avec).toEqual([])
})

test('une piece a remplacer ne compte plus et la demande passe en tete des pieces', () => {
  const etapes = resteAFaire({
    profil: 'retraite',
    engagement: declare,
    pieces: [...communes, { id: 'g', type: 'pension_retraite' }],
    demandes: [{ etat: 'demande', piece_initiale: 'g' }],
    mentionAttendue: false,
  })
  expect(etapes.map((e) => e.sorte)).toEqual(['complement', 'piece'])
})

test('la mention manque tant qu elle n est pas apposee, et seulement si elle est attendue', () => {
  const base = {
    profil: 'retraite' as const,
    pieces: [...communes, { id: 'g', type: 'pension_retraite' }],
    demandes: [],
  }
  const sansMention = { ...declare, mentionApposee: false }
  expect(resteAFaire({ ...base, engagement: sansMention, mentionAttendue: true })).toEqual([
    { sorte: 'mention' },
  ])
  expect(resteAFaire({ ...base, engagement: sansMention, mentionAttendue: false })).toEqual([])
  expect(
    resteAFaire({
      ...base,
      engagement: { ...sansMention, revenuDeclare: false },
      mentionAttendue: true,
    }).map((e) => e.sorte),
  ).toEqual(['engagement', 'mention'])
})
