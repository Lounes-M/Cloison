import type { PGlite } from '@electric-sql/pglite'
import { describe, expect, test } from 'vitest'
import { natures } from '@/lib/content/garant'
import {
  TAILLE_MAX_DEPOT,
  analyserEngagement,
  montantEnCents,
  natureDepuis,
  tailleLisible,
} from '@/lib/garant/validation'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'

/**
 * Ce que le garant peut soumettre.
 *
 * Deux affirmations relient ce fichier a la base et meritent d'etre
 * verifiees plutot que tenues pour acquises : la liste des natures est le
 * miroir de la contrainte `type` de `pieces`, et le formulaire d'engagement
 * n'ecrit que les colonnes que la migration 0003 accorde au garant.
 */

describe('les natures de pieces', () => {
  test('chaque nature du contenu est acceptee par la base, et aucune autre', async () => {
    const db: PGlite = await baseDEssai()
    await devenir(db, 'anon')
    const { rows } = await db.query<{ ouvrir_dossier: string }>(
      `select public.ouvrir_dossier('locataire@exemple.fr')`,
    )
    await redevenirProprietaire(db)
    const { rows: d } = await db.query<{ id: string }>(
      'select id from public.dossiers where reference = $1',
      [rows[0]!.ouvrir_dossier],
    )
    const dossier = d[0]!.id

    for (const nature of natures) {
      await db.query(
        `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
         values ($1, $2, $3, 1024, 'application/pdf')`,
        [dossier, nature.valeur, `${dossier}/${nature.valeur}`],
      )
    }

    // Le sens inverse : ce que la base accepte, le contenu le connait. Sinon
    // une nature existerait sans libelle, donc sans moyen de la deposer.
    const { rows: contrainte } = await db.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.pieces'::regclass and conname = 'pieces_type_check'`,
    )
    for (const valeur of contrainte[0]!.def.matchAll(/'([a-z_]+)'/g)) {
      expect(natureDepuis(valeur[1])).toBe(valeur[1])
    }

    expect(
      await refus(
        db,
        `insert into public.pieces (dossier_id, type, chemin, taille_octets, type_reel)
         values ('${dossier}', 'releve_bancaire', '${dossier}/x', 1024, 'application/pdf')`,
      ),
    ).toContain('pieces_type_check')
  }, 30_000)

  test('natureDepuis refuse tout ce qui n est pas dans la liste', () => {
    expect(natureDepuis('bulletin_paie')).toBe('bulletin_paie')
    for (const valeur of ['', 'BULLETIN_PAIE', 'releve_bancaire', 42, null, undefined, {}]) {
      expect(natureDepuis(valeur)).toBeNull()
    }
  })
})

describe('le montant', () => {
  test('il lit ce que les gens tapent', () => {
    expect(montantEnCents('1200')).toBe(120_000)
    expect(montantEnCents('1 200')).toBe(120_000)
    expect(montantEnCents('1200,50')).toBe(120_050)
    expect(montantEnCents('1200.50')).toBe(120_050)
    expect(montantEnCents('1 200,00 €')).toBe(120_000)
    expect(montantEnCents('  850 ')).toBe(85_000)
  })

  test('vide vaut « pas de plafond », et ce n est pas une erreur', () => {
    expect(montantEnCents('')).toBeNull()
    expect(montantEnCents('   ')).toBeNull()
  })

  test('il refuse ce qui ne se lit pas sans deviner', () => {
    for (const saisie of ['abc', '12,345', '1.2.3', '-100', '0', '1e5', '100 000 000 000']) {
      expect(montantEnCents(saisie)).toBe('invalide')
    }
  })
})

describe('l engagement', () => {
  const AUJOURDHUI = new Date('2026-09-03T12:00:00Z')

  test('un engagement complet passe', () => {
    const analyse = analyserEngagement(
      { couvre: 'loyer_charges', montant: '1 200', jusquAu: '2029-08-31', solidaire: 'on' },
      AUJOURDHUI,
    )
    expect(analyse).toEqual({
      ok: true,
      engagement: {
        couvre: 'loyer_charges',
        montantMaxCents: 120_000,
        jusquAu: '2029-08-31',
        solidaire: true,
        revenuNetMensuelCents: null,
      },
    })
  })

  test('le minimum est ce que le garant couvre, tout le reste peut manquer', () => {
    const analyse = analyserEngagement({ couvre: 'loyer' }, AUJOURDHUI)
    expect(analyse).toEqual({
      ok: true,
      engagement: {
        couvre: 'loyer',
        montantMaxCents: null,
        jusquAu: null,
        solidaire: false,
        revenuNetMensuelCents: null,
      },
    })
  })

  test('le revenu se lit comme un montant, et vide vaut « pas encore »', () => {
    const declare = analyserEngagement({ couvre: 'loyer', revenu: '3 200,50' }, AUJOURDHUI)
    expect(declare.ok && declare.engagement.revenuNetMensuelCents).toBe(320_050)

    // Vide n'est pas une erreur : le dossier reste en attente, et la base ne
    // calcule rien tant que ce terme manque.
    const vide = analyserEngagement({ couvre: 'loyer', revenu: '' }, AUJOURDHUI)
    expect(vide.ok && vide.engagement.revenuNetMensuelCents).toBeNull()

    expect(analyserEngagement({ couvre: 'loyer', revenu: 'beaucoup' }, AUJOURDHUI).ok).toBe(false)
  })

  test('une case non cochee vaut non, jamais autre chose', () => {
    for (const solidaire of [undefined, '', 'off', 'non', 'false']) {
      const analyse = analyserEngagement({ couvre: 'loyer', solidaire }, AUJOURDHUI)
      expect(analyse.ok && analyse.engagement.solidaire).toBe(false)
    }
  })

  test('une date passee est refusee, aujourd hui passe', () => {
    expect(analyserEngagement({ couvre: 'loyer', jusquAu: '2026-09-02' }, AUJOURDHUI).ok).toBe(
      false,
    )
    expect(analyserEngagement({ couvre: 'loyer', jusquAu: '2026-09-03' }, AUJOURDHUI).ok).toBe(true)
  })

  test('une date qui n existe pas est refusee', () => {
    for (const jusquAu of ['2027-02-30', '2027-13-01', '31/12/2027', 'demain']) {
      expect(analyserEngagement({ couvre: 'loyer', jusquAu }, AUJOURDHUI).ok).toBe(false)
    }
  })

  test('ce que tu couvres n admet que deux valeurs', () => {
    for (const couvre of [undefined, '', 'tout', 'LOYER']) {
      expect(analyserEngagement({ couvre }, AUJOURDHUI).ok).toBe(false)
    }
  })
})

describe('les bornes', () => {
  test('la borne pratique est sous celle de Vercel, et sous celle de la base', () => {
    // 4,5 Mo par corps de requete chez Vercel, 20 Mo dans la table. Celle-ci
    // doit tenir entre les deux, avec de la marge pour l'enveloppe du formulaire.
    expect(TAILLE_MAX_DEPOT).toBeLessThan(4.5 * 1024 * 1024)
    expect(TAILLE_MAX_DEPOT).toBeLessThan(20 * 1024 * 1024)
  })

  test('les tailles se lisent en francais', () => {
    expect(tailleLisible(340 * 1024)).toBe('340 Ko')
    expect(tailleLisible(1.25 * 1024 * 1024)).toBe('1,3 Mo')
    expect(tailleLisible(512)).toBe('512 o')
  })
})
