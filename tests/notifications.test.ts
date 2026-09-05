import { devenirPorteur } from './base'
import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import { courrielsPour } from '@/lib/courriels/notifications'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'

/**
 * Les courriels qui suivent un dossier.
 *
 * Deux regles a tenir, et un secret a garder. Aucun courriel a un porteur de
 * lien ne contient de lien. Aucun libelle au locataire ne contient de chiffre.
 * Et les adresses de l'agence ne sortent que pour qui tient le dossier.
 */

const DOSSIER = {
  id: '44444444-4444-4444-4444-444444444444',
  reference: 'AbCdEfGhIjKl',
  statut: 'complet',
  email_locataire: 'locataire@exemple.fr',
  email_garant: 'garant@exemple.fr',
  demonstration: false,
}

describe('courrielsPour', () => {
  test('complet : le locataire et l agence, pas le garant', () => {
    const envois = courrielsPour(DOSSIER, ['marie@agence-lyon3.fr'])
    expect(envois.map((e) => e.a)).toEqual(['locataire@exemple.fr', ['marie@agence-lyon3.fr']])
  })

  test('transmis : le locataire et le garant, pas l agence', () => {
    const envois = courrielsPour({ ...DOSSIER, statut: 'transmis' }, ['marie@agence-lyon3.fr'])
    expect(envois.map((e) => e.a)).toEqual(['locataire@exemple.fr', 'garant@exemple.fr'])
    expect(envois[1]!.texte).toContain('figées')
    expect(envois[1]!.texte).toContain('ne constitue pas une signature')
  })

  test('garant insuffisant : le locataire et l agence, sans le pourquoi', () => {
    const envois = courrielsPour({ ...DOSSIER, statut: 'garant_insuffisant' }, ['a@b.fr'])
    const auLocataire = envois.find((e) => e.a === 'locataire@exemple.fr')!
    // Aucun chiffre : ni ratio, ni seuil, ni montant.
    expect(auLocataire.texte).not.toMatch(/\d/)
    expect(auLocataire.texte).not.toMatch(/ratio|seuil|revenu/i)
  })

  test('les statuts sans nouvelle n ecrivent a personne', () => {
    for (const statut of ['ouvert', 'depot_en_cours', 'signe', 'expire']) {
      expect(courrielsPour({ ...DOSSIER, statut }, ['a@b.fr'])).toEqual([])
    }
  })

  test('aucun lien pour le locataire ni le garant, un lien pour l agence', () => {
    for (const statut of ['complet', 'garant_insuffisant', 'transmis', 'refuse']) {
      const envois = courrielsPour({ ...DOSSIER, statut }, ['a@b.fr'])
      for (const envoi of envois) {
        if (Array.isArray(envoi.a)) {
          expect(envoi.texte).toContain(`/espace/dossiers/${DOSSIER.id}`)
        } else {
          // En emettre un revoquerait celui qu'ils tiennent.
          expect(envoi.texte).not.toMatch(/https?:\/\//)
          expect(envoi.texte).not.toContain('/lien/')
        }
      }
    }
  })

  test('sans garant designe, rien ne lui est ecrit', () => {
    const envois = courrielsPour({ ...DOSSIER, statut: 'transmis', email_garant: null }, [])
    expect(envois.map((e) => e.a)).toEqual(['locataire@exemple.fr'])
  })

  test('chaque courriel porte la reference du dossier', () => {
    for (const envoi of courrielsPour(DOSSIER, ['a@b.fr'])) {
      expect(envoi.texte).toContain(DOSSIER.reference)
    }
  })
})

describe('contacts_agence_du_dossier', () => {
  const MARIE = '11111111-1111-1111-1111-111111111111'
  const SAM = '55555555-5555-5555-5555-555555555555'
  let db: PGlite
  let dossier: string
  let autre: string

  async function ouvrir(email: string) {
    await devenir(db, 'serveur')
    const { rows } = await db.query<{ ouvrir_dossier: string }>(
      `select public.ouvrir_dossier($1)`,
      [email],
    )
    await redevenirProprietaire(db)
    const { rows: d } = await db.query<{ id: string }>(
      'select id from public.dossiers where reference = $1',
      [rows[0]!.ouvrir_dossier],
    )
    return d[0]!.id
  }

  async function contacts(id: string) {
    const { rows } = await db.query<{ contacts_agence_du_dossier: string }>(
      `select public.contacts_agence_du_dossier($1)`,
      [id],
    )
    return rows.map((r) => r.contacts_agence_du_dossier)
  }

  beforeEach(async () => {
    db = await baseDEssai()
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${MARIE}', 'marie@agence-lyon3.fr', now()),
        ('${SAM}',   'sam@autre-agence.fr',   now())
    `)
    await devenir(db, 'authenticated', MARIE)
    await db.query(`select public.rejoindre_ou_creer_agence('Agence Lyon 3')`)
    await devenir(db, 'authenticated', SAM)
    await db.query(`select public.rejoindre_ou_creer_agence('Autre Agence')`)

    dossier = await ouvrir('locataire@exemple.fr')
    autre = await ouvrir('autre@exemple.fr')
    await redevenirProprietaire(db)
    await db.query(`
      update public.dossiers set agence_id = (select id from public.agences where domaine = 'agence-lyon3.fr')
       where id = '${dossier}'
    `)
    await db.query(`
      update public.dossiers set agence_id = (select id from public.agences where domaine = 'autre-agence.fr')
       where id = '${autre}'
    `)
  })

  test('le garant obtient les adresses de l agence de son dossier, et rien d autre', async () => {
    await devenirPorteur(db, dossier, 'garant')

    expect(await contacts(dossier)).toEqual(['marie@agence-lyon3.fr'])
    // Un autre dossier, meme en le nommant : rien.
    expect(await contacts(autre)).toEqual([])
  })

  test('une agence obtient ses propres contacts, pas ceux d une autre', async () => {
    await devenir(db, 'authenticated', SAM)
    expect(await contacts(autre)).toEqual(['sam@autre-agence.fr'])
    expect(await contacts(dossier)).toEqual([])
  })

  test('anon n atteint pas la fonction', async () => {
    await devenir(db, 'anon')
    expect(await refus(db, `select public.contacts_agence_du_dossier('${dossier}')`)).toContain(
      'permission denied',
    )
  })

  test('un dossier sans agence ne rend personne', async () => {
    const libre = await ouvrir('libre@exemple.fr')
    await devenirPorteur(db, libre, 'garant')
    expect(await contacts(libre)).toEqual([])
  })
})
