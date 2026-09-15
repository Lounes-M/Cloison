import { expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { examinerDemande, type DemandeDeDroits } from '@/lib/droits/regles'
const id = '11111111-1111-4111-8111-111111111111'
const date = Date.parse('2026-09-15T10:00:00Z')
function demande(): DemandeDeDroits {
  return {
    version: 1,
    demande: id,
    revision: id,
    operateur: id,
    nature: 'acces',
    identite: { etat: 'verifiee', preuveSha256: 'a'.repeat(64), mandat: 'non_requis' },
    perimetreConfirme: true,
    inventaireComplet: true,
    ressources: [
      {
        id,
        revision: id,
        categorie: 'piece',
        appartenance: 'demandeur',
        revueTiers: 'validee',
        portabilite: 'eligible',
        dernierAdministrateur: false,
        conservation: null,
      },
    ],
  }
}
test.each(['a_verifier', 'doute'] as const)('aucune proposition avec identite %s', (etat) => {
  const d = demande()
  d.identite.etat = etat
  const resultat = examinerDemande(d, date)
  expect(resultat.blocages).toContain('identite')
  expect(resultat.ressources[0]!.action).toBe('examiner')
})
test('mandat, preuve et inventaire sont necessaires', () => {
  const d = demande()
  d.identite.preuveSha256 = null
  d.identite.mandat = 'a_verifier'
  d.inventaireComplet = false
  d.perimetreConfirme = false
  expect(examinerDemande(d, date).blocages).toEqual([
    'identite',
    'mandat',
    'perimetre',
    'inventaire',
  ])
})
test.each(['acces', 'portabilite', 'effacement'] as const)(
  'ne traite pas les donnees des tiers pour %s',
  (nature) => {
    const d = demande()
    d.nature = nature
    d.ressources[0]!.appartenance = 'tiers'
    expect(examinerDemande(d, date).ressources[0]!.action).toBe('exclure')
  },
)
test('une copie mixte exige une revue puis une expurgation, jamais un effacement global', () => {
  const d = demande()
  d.ressources[0]!.appartenance = 'mixte'
  d.ressources[0]!.revueTiers = 'a_faire'
  expect(examinerDemande(d, date).ressources[0]!.action).toBe('examiner')
  d.ressources[0]!.revueTiers = 'validee'
  expect(examinerDemande(d, date).ressources[0]!.motif).toBe('copie_expurgee_a_relire')
  d.nature = 'effacement'
  expect(examinerDemande(d, date).ressources[0]!.action).toBe('examiner')
})
test('la portabilite ne se confond pas avec acces', () => {
  const d = demande()
  d.ressources[0]!.portabilite = 'non_eligible'
  expect(examinerDemande(d, date).ressources[0]!.action).toBe('preparer_copie')
  d.nature = 'portabilite'
  expect(examinerDemande(d, date).ressources[0]!.action).toBe('exclure')
})
test('une conservation expiree doit etre reexaminee, jamais prolongee automatiquement', () => {
  const d = demande()
  d.nature = 'effacement'
  d.ressources[0]!.conservation = {
    motif: 'defense_droits',
    preuveSha256: 'b'.repeat(64),
    reexaminerLe: '2026-09-16T10:00:00Z',
  }
  expect(examinerDemande(d, date).ressources[0]!.action).toBe('conserver')
  expect(examinerDemande(d, date + 86400000).ressources[0]!.action).toBe('examiner')
})
test.each(['acte', 'paiement', 'journal', 'compte', 'secret'] as const)(
  'protege les dependances %s',
  (categorie) => {
    const d = demande()
    d.nature = 'effacement'
    d.ressources[0]!.categorie = categorie
    expect(examinerDemande(d, date).ressources[0]!.action).toBe('examiner')
  },
)
test('une proposition reste sans autorisation de mutation', () => {
  const d = demande()
  d.nature = 'effacement'
  expect(examinerDemande(d, date)).toMatchObject({
    executionAutorisee: false,
    ressources: [{ action: 'proposer_effacement' }],
  })
  d.ressources[0]!.dernierAdministrateur = true
  expect(examinerDemande(d, date).ressources[0]!.motif).toBe('succession_administrateur')
})
test('refuse les ressources dupliquees et les champs non declares sans exposer le contenu', () => {
  const d = demande()
  d.ressources.push(d.ressources[0]!)
  expect(() => examinerDemande(d, date)).toThrow('Demande de droits invalide.')
  expect(() => examinerDemande({ ...demande(), email: 'prive' }, date)).toThrow(
    'Demande de droits invalide.',
  )
})
test('le CLI lit un inventaire et ne livre aucun contenu de la preuve', () => {
  const r = spawnSync(process.execPath, ['scripts/examiner-demande-droits.mjs'], {
    input: JSON.stringify(demande()),
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(r.status).toBe(0)
  expect(JSON.parse(r.stdout).executionAutorisee).toBe(false)
  expect(r.stdout).not.toContain('a'.repeat(64))
})
test.each(['{"contenu":"prive"}', 'x'.repeat(256 * 1024 + 1)])(
  'le CLI refuse une entree invalide sans la journaliser',
  (input) => {
    const r = spawnSync(process.execPath, ['scripts/examiner-demande-droits.mjs'], {
      input,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toContain('Demande de droits invalide.')
    expect(r.stderr).not.toContain('contenu')
  },
)
