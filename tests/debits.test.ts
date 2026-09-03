import { randomBytes } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { consommerDebit, empreinteDe } from '@/lib/acces/debit'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

/**
 * La limitation de debit.
 *
 * Deux proprietes se verifient ici, et aucune ne consiste a savoir compter.
 * La premiere : l'appelant ne choisit pas son plafond. La seconde : ce qui
 * arrive en base n'est jamais une adresse.
 */

const UNE = 'a'.repeat(64)
const AUTRE = 'b'.repeat(64)

async function passe(db: PGlite, sujet: string, empreinte: string): Promise<boolean> {
  const { rows } = await db.query<{ consommer_debit: boolean }>(
    `select public.consommer_debit($1, $2)`,
    [sujet, empreinte],
  )
  return rows[0]!.consommer_debit
}

describe('consommer_debit', () => {
  let db: PGlite

  beforeEach(async () => {
    db = await baseDEssai()
    await devenir(db, 'anon')
  })

  test('les premieres passent, celles d apres non', async () => {
    // Cinq pour le formulaire agence, et la sixieme est refusee.
    for (let i = 0; i < 5; i += 1) {
      expect(await passe(db, 'demande_agence', UNE)).toBe(true)
    }
    expect(await passe(db, 'demande_agence', UNE)).toBe(false)
    expect(await passe(db, 'demande_agence', UNE)).toBe(false)
  })

  test('les plafonds different selon ce qu on protege', async () => {
    // Un lien magique envoie un e-mail a une adresse choisie par l'appelant :
    // il est tenu plus court que le formulaire.
    for (let i = 0; i < 3; i += 1) {
      expect(await passe(db, 'lien_locataire', UNE)).toBe(true)
    }
    expect(await passe(db, 'lien_locataire', UNE)).toBe(false)

    // Et la meme empreinte a son compte a part sur un autre sujet.
    expect(await passe(db, 'demande_agence', UNE)).toBe(true)
  })

  test('chaque cible a son propre compte', async () => {
    for (let i = 0; i < 6; i += 1) await passe(db, 'demande_agence', UNE)

    expect(await passe(db, 'demande_agence', UNE)).toBe(false)
    expect(await passe(db, 'demande_agence', AUTRE)).toBe(true)
  })

  test('l appelant ne choisit pas son plafond', async () => {
    // La fonction ne prend ni plafond ni fenetre : il n'y a rien a demander
    // d'excessif, plutot qu'une valeur a valider.
    const { rows } = await db.query<{ arguments: string }>(
      `select pg_get_function_arguments(oid) as arguments
         from pg_proc where proname = 'consommer_debit'`,
    )
    expect(rows[0]!.arguments).toBe('le_sujet text, l_empreinte text')
  })

  test('un sujet inconnu est refuse', async () => {
    expect(await refus(db, `select public.consommer_debit('tout_permis', '${UNE}')`)).toContain(
      'Sujet de limitation inconnu',
    )
  })

  test('une valeur qui n est pas une empreinte est refusee', async () => {
    // Une adresse en clair signalerait un appelant qui a saute le calcul, donc
    // une limite qui ne limiterait rien et une donnee personnelle en base.
    for (const valeur of ['marie@exemple.fr', '192.168.1.1', '', 'a'.repeat(63), 'Z'.repeat(64)]) {
      expect(
        await refus(db, `select public.consommer_debit('demande_agence', '${valeur}')`),
      ).toContain('Empreinte attendue')
    }
  })

  test('un seau passe est efface plutot que garde', async () => {
    await passe(db, 'demande_agence', UNE)

    await redevenirProprietaire(db)
    await db.query(`
      insert into public.debits (cle, fenetre, compte)
      values ('demande_agence:${UNE}', now() - interval '2 hours', 99)
    `)
    expect(await compter(db, 'public.debits')).toBe(2)

    await devenir(db, 'anon')
    // Le comptage repart, et la ligne ancienne disparait : la table reste a une
    // ligne par cle vivante, sans tache de fond a surveiller.
    expect(await passe(db, 'demande_agence', UNE)).toBe(true)

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.debits')).toBe(1)
  })

  test('personne ne lit ni n ecrit la table directement', async () => {
    await devenir(db, 'anon')
    await passe(db, 'demande_agence', UNE)

    for (const role of ['anon', 'authenticated'] as const) {
      await devenir(db, role)
      expect(await refus(db, 'select * from public.debits')).toContain('permission denied')
      expect(
        await refus(db, `delete from public.debits where cle like 'demande_agence:%'`),
      ).toContain('permission denied')
    }

    await redevenirProprietaire(db)
    expect(await compter(db, 'public.debits')).toBe(1)
  })

  test('la table ne garde aucune adresse ni aucun horodatage individuel', async () => {
    await devenir(db, 'anon')
    await passe(db, 'demande_agence', UNE)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ cle: string }>('select cle from public.debits')

    // Ce que verrait qui obtiendrait cette table : un sujet et une empreinte.
    expect(rows[0]!.cle).toBe(`demande_agence:${UNE}`)

    const { rows: colonnes } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'debits' order by ordinal_position`,
    )
    expect(colonnes.map((c) => c.column_name)).toEqual(['cle', 'fenetre', 'compte'])
  })
})

describe('l empreinte', () => {
  beforeAll(() => {
    process.env.CLE_MAITRESSE = randomBytes(32).toString('base64')
  })

  test('elle a la forme que la base exige', () => {
    expect(empreinteDe('marie@exemple.fr')).toMatch(/^[0-9a-f]{64}$/)
  })

  test('elle est stable, et differente par cible', () => {
    expect(empreinteDe('marie@exemple.fr')).toBe(empreinteDe('marie@exemple.fr'))
    expect(empreinteDe('marie@exemple.fr')).not.toBe(empreinteDe('sam@exemple.fr'))
  })

  test('une majuscule ou une espace ne contourne pas la limite', () => {
    const attendue = empreinteDe('marie@exemple.fr')
    for (const variante of ['Marie@Exemple.fr', ' marie@exemple.fr ', 'MARIE@EXEMPLE.FR']) {
      expect(empreinteDe(variante)).toBe(attendue)
    }
  })

  test('elle ne contient pas la cible', () => {
    expect(empreinteDe('marie@exemple.fr')).not.toContain('marie')
  })

  test('elle change avec la cle maitresse', () => {
    const avant = empreinteDe('marie@exemple.fr')
    const vraie = process.env.CLE_MAITRESSE
    process.env.CLE_MAITRESSE = randomBytes(32).toString('base64')

    // La donnee est chez Supabase, la cle chez Vercel : sans elle, l'empreinte
    // ne se relie a aucune adresse, meme par force brute sur un espace de
    // recherche etroit comme celui des adresses IP.
    expect(empreinteDe('marie@exemple.fr')).not.toBe(avant)

    process.env.CLE_MAITRESSE = vraie
  })
})

describe('consommerDebit', () => {
  beforeAll(() => {
    process.env.CLE_MAITRESSE = randomBytes(32).toString('base64')
  })

  test('elle refuse quand la base ne repond pas', async () => {
    const enPanne = {
      rpc: async () => ({ data: null, error: { message: 'reseau coupe' } }),
    } as never

    // Laisser passer parce qu'on n'a pas su compter reviendrait a desactiver la
    // limite au moment precis ou quelqu'un s'acharne dessus.
    expect(await consommerDebit(enPanne, 'demande_agence', '10.0.0.1')).toBe(false)
  })

  test('elle refuse aussi une reponse qui n est pas un oui franc', async () => {
    for (const data of [null, undefined, 'true', 1, {}]) {
      const bizarre = { rpc: async () => ({ data, error: null }) } as never
      expect(await consommerDebit(bizarre, 'demande_agence', '10.0.0.1')).toBe(false)
    }
  })

  test('elle envoie l empreinte, jamais la cible', async () => {
    let recu: Record<string, string> | null = null
    const espion = {
      rpc: async (_nom: string, parametres: Record<string, string>) => {
        recu = parametres
        return { data: true, error: null }
      },
    } as never

    await consommerDebit(espion, 'lien_garant', 'marie@exemple.fr')

    expect(recu).toEqual({
      le_sujet: 'lien_garant',
      l_empreinte: empreinteDe('marie@exemple.fr'),
    })
  })
})
