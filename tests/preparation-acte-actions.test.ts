import { beforeEach, expect, test, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
const mocks = vi.hoisted(() => ({ contexte: vi.fn(), reserver: vi.fn(), archiver: vi.fn() }))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: mocks.contexte }))
vi.mock('@/lib/signature/configuration-parcours', () => ({
  configurationParcours: () => ({ mode: 'sandbox', modele: 'recette', jours: 30 }),
}))
vi.mock('@/lib/signature/parcours', () => ({
  archiverFichier: mocks.archiver,
  ouvrirContexteActe: vi.fn(),
}))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: async () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/coffre/rotation-maitresse', () => ({
  scellerMaitresse: (b: Buffer) => Buffer.from(b),
}))
import { preparerActe } from '@/lib/signature/actions'
const dossier = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.reserver.mockImplementation(async (_nom, args) => ({ data: args.le_id, error: null }))
  mocks.contexte.mockResolvedValue({
    etat: 'rattache',
    agence: { statut: 'verifiee' },
    supabase: {
      rpc: mocks.reserver,
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              error: null,
              data:
                table === 'dossiers'
                  ? {
                      id: dossier,
                      email_garant: 'recette@example.invalid',
                      statut: 'transmis',
                      expire_le: new Date(Date.now() + 86400000 * 7).toISOString(),
                      demonstration: false,
                    }
                  : {
                      nom: 'Fictif',
                      prenom: 'Essai',
                      mention: 'Mention fictive',
                      mention_saisie_le: new Date().toISOString(),
                      version_conditions: 1,
                    },
            }),
          }),
        }),
      }),
    },
  })
})
function formulaire(pdf: Uint8Array, page = 1) {
  const form = new FormData()
  for (const [k, v] of Object.entries({
    dossier,
    telephone: '+33600000000',
    page: String(page),
    x: '40',
    y: '40',
    accord: 'on',
  }))
    form.set(k, v)
  form.set('pdf', new File([Uint8Array.from(pdf)], 'recette.pdf', { type: 'application/pdf' }))
  return form
}
async function pdfValide() {
  const pdf = await PDFDocument.create()
  pdf.addPage([595, 842])
  return pdf.save()
}
test('le faux PDF est refuse avant toute reservation ou ecriture', async () => {
  const etat = await preparerActe({ message: '' }, formulaire(Buffer.from('%PDF-1.7 faux')))
  expect(etat.id).toBeUndefined()
  expect(mocks.reserver).not.toHaveBeenCalled()
  expect(mocks.archiver).not.toHaveBeenCalled()
})
test('la page inexistante est refusee avant toute reservation', async () => {
  await preparerActe({ message: '' }, formulaire(await pdfValide(), 2))
  expect(mocks.reserver).not.toHaveBeenCalled()
})
test('le PDF valide est reserve puis archive', async () => {
  const etat = await preparerActe({ message: '' }, formulaire(await pdfValide()))
  expect(etat.id).toBeDefined()
  expect(mocks.reserver).toHaveBeenCalledTimes(1)
  expect(mocks.archiver).toHaveBeenCalledTimes(1)
})
test('une agence non verifiee ne reserve rien', async () => {
  mocks.contexte.mockResolvedValue({ etat: 'rattache', agence: { statut: 'en_attente' } })
  await preparerActe({ message: '' }, formulaire(await pdfValide()))
  expect(mocks.reserver).not.toHaveBeenCalled()
})

const MENTION =
  'Je m’engage en qualité de caution solidaire à payer au bailleur ce que lui doit le locataire en cas de défaillance de celui-ci, dans la limite de douze mille euros (12 000 €), et je renonce aux bénéfices de discussion et de division.'
function engagementComplet(montant = 1200000) {
  mocks.contexte.mockResolvedValue({
    etat: 'rattache',
    agence: { statut: 'verifiee', nom: 'Agence Témoin' },
    supabase: {
      rpc: mocks.reserver,
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              error: null,
              data:
                table === 'dossiers'
                  ? {
                      id: dossier,
                      email_garant: 'recette@example.invalid',
                      statut: 'transmis',
                      expire_le: new Date(Date.now() + 86400000 * 7).toISOString(),
                      demonstration: false,
                    }
                  : {
                      nom: 'Exemple',
                      prenom: 'Camille',
                      adresse: '1 rue de l’Essai, 69001 Lyon',
                      mention: MENTION,
                      mention_saisie_le: '2026-10-20T07:30:00.000Z',
                      version_conditions: 1,
                      solidaire: true,
                      couvre: 'loyer_charges',
                      montant_max_cents: montant,
                      jusqu_au: null,
                    },
            }),
          }),
        }),
      }),
    },
  })
}
function formulaireModele() {
  const form = new FormData()
  for (const [k, v] of Object.entries({
    dossier,
    source: 'modele',
    telephone: '+33600000000',
    accord: 'on',
    civilite: 'madame',
    naissance_le: '1970-05-01',
    naissance_lieu: 'Lyon',
    locataire: 'Alex Fictif',
    bailleur_nom: 'SCI Démonstration',
    bailleur_adresse: '2 place du Test, 75001 Paris',
    logement: '3 allée des Modèles, 75011 Paris',
    loyer: '950',
    charges: '80,50',
    periodicite: 'mois',
    revision_le: '2026-11-01',
    irl_trimestre: '2',
    irl_annee: '2026',
    co_cautions: '',
    fait_lieu: 'Paris',
    fait_le: '2026-10-26',
  }))
    form.set(k, v)
  return form
}
test('le modele Cloison est redige depuis le dossier, reserve puis archive', async () => {
  engagementComplet()
  const etat = await preparerActe({ message: '' }, formulaireModele())
  expect(etat.id).toBeDefined()
  expect(mocks.reserver).toHaveBeenCalledWith(
    'preparer_acte_signature',
    expect.objectContaining({ le_modele: 'cloison-cautionnement-2026-10' }),
  )
  const pdf = mocks.archiver.mock.calls[0]![3] as Buffer
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
})
test('une mention qui ne couvre pas le plafond bloque le modele avant toute reservation', async () => {
  engagementComplet(1300000)
  const etat = await preparerActe({ message: '' }, formulaireModele())
  expect(etat.id).toBeUndefined()
  expect(etat.message).toContain('plafond')
  expect(mocks.reserver).not.toHaveBeenCalled()
})
