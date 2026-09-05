import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  montantsEnChiffres,
  nombreEnLettres,
  normaliserLettres,
  verifierMention,
} from '@/lib/garant/mention'
import { baseDEssai, compter, devenir, redevenirProprietaire, refus } from './base'

/**
 * La mention de l'article 2297.
 *
 * Deux moities. La premiere est pure : lire ce que le garant a ecrit, et dire
 * ce qui manque, sans jamais fournir la phrase. La seconde est la base : la
 * mention n'est ecrite que par le garant, datee, et jamais par le serveur.
 *
 * Aucun test ne contient de mention complete « modele » : ce fichier est lu
 * par des humains, et une phrase parfaite ici finirait copiee dans l'ecran.
 * Les mentions d'essai sont volontairement maladroites.
 */

describe('nombreEnLettres', () => {
  test('les cas qui piegent le francais', () => {
    expect(nombreEnLettres(1)).toBe('un')
    expect(nombreEnLettres(21)).toBe('vingt-et-un')
    expect(nombreEnLettres(71)).toBe('soixante-et-onze')
    expect(nombreEnLettres(80)).toBe('quatre-vingts')
    expect(nombreEnLettres(81)).toBe('quatre-vingt-un')
    expect(nombreEnLettres(91)).toBe('quatre-vingt-onze')
    expect(nombreEnLettres(100)).toBe('cent')
    expect(nombreEnLettres(101)).toBe('cent-un')
    expect(nombreEnLettres(200)).toBe('deux-cents')
    expect(nombreEnLettres(201)).toBe('deux-cent-un')
    expect(nombreEnLettres(1000)).toBe('mille')
    expect(nombreEnLettres(1200)).toBe('mille-deux-cents')
    expect(nombreEnLettres(12_000)).toBe('douze-mille')
    expect(nombreEnLettres(43_200)).toBe('quarante-trois-mille-deux-cents')
    expect(nombreEnLettres(1_000_000)).toBe('un-million')
    expect(nombreEnLettres(2_000_500)).toBe('deux-millions-cinq-cents')
  })

  test('il refuse ce qui n est pas un plafond', () => {
    for (const n of [-1, 1.5, 1_000_000_000, Number.NaN]) {
      expect(() => nombreEnLettres(n)).toThrow()
    }
  })
})

describe('normaliserLettres', () => {
  test('les orthographes d un meme nombre se rejoignent', () => {
    const attendu = normaliserLettres('quatre-vingt-dix-mille')
    for (const variante of [
      'quatre vingt dix mille',
      'QUATRE-VINGTS-DIX MILLE',
      'quatre vingts dix mille',
      'quatre vingt‑dix‑mille',
    ]) {
      expect(normaliserLettres(variante)).toBe(attendu)
    }
  })

  test('« et » ne compte pas, les accents non plus', () => {
    expect(normaliserLettres('vingt et un')).toBe(normaliserLettres('vingt-et-un'))
    expect(normaliserLettres('Zéro')).toBe('zero')
  })
})

describe('montantsEnChiffres', () => {
  test('il lit les facons courantes d ecrire un montant', () => {
    expect(montantsEnChiffres('12 000 euros')).toEqual([12_000])
    expect(montantsEnChiffres('12000 €')).toEqual([12_000])
    expect(montantsEnChiffres('12.000,00 EUR')).toEqual([12_000])
    expect(montantsEnChiffres('43 200 euros')).toEqual([43_200])
  })

  test('il ne prend pas une date ou un numero pour un montant', () => {
    // Le reste du texte peut contenir des chiffres qui ne sont pas le plafond ;
    // on garde tous les candidats et c'est la concordance avec les lettres qui
    // tranche.
    expect(montantsEnChiffres('le 3 septembre 2026, 12 000 euros')).toEqual([3, 2026, 12_000])
  })
})

describe('verifierMention', () => {
  // Maladroite a dessein : elle passe, sans etre un modele.
  const PASSE =
    'Moi, garant, je me porte caution et je paierai au bailleur ce que le locataire lui devra ' +
    'en cas de defaillance, jusqu a douze mille euros (12 000 euros).'

  test('une mention qui contient les trois elements passe', () => {
    expect(verifierMention(PASSE, false)).toEqual({ ok: true, montantEuros: 12_000 })
  })

  test('sans le mot caution, il manque la qualite', () => {
    const sans = PASSE.replace('caution', 'garant')
    expect(verifierMention(sans, false)).toEqual({ ok: false, manques: ['caution'] })
  })

  test('sans defaillance ni paiement, il manque l engagement de payer', () => {
    const sans = 'Je suis caution pour douze mille euros (12 000 euros).'
    expect(verifierMention(sans, false)).toEqual({ ok: false, manques: ['paiement'] })
  })

  test('chiffres et lettres doivent dire le meme montant', () => {
    // Douze mille en lettres, treize mille en chiffres : rien ne concorde.
    const divergent = PASSE.replace('(12 000 euros)', '(13 000 euros)')
    expect(verifierMention(divergent, false)).toEqual({ ok: false, manques: ['montant'] })

    // Sans les lettres du tout.
    const sansLettres = PASSE.replace('douze mille euros ', '')
    expect(verifierMention(sansLettres, false)).toEqual({ ok: false, manques: ['montant'] })
  })

  test('l orthographe des lettres ne compte pas, le nombre oui', () => {
    const vieille = PASSE.replace('douze mille', 'DOUZE MILLE')
    expect(verifierMention(vieille, false).ok).toBe(true)
  })

  test('solidaire : il faut le dire et renoncer aux deux benefices', () => {
    expect(verifierMention(PASSE, true)).toEqual({ ok: false, manques: ['solidarite'] })

    const solidaire =
      PASSE + ' Je m engage solidairement et renonce aux benefices de discussion et de division.'
    expect(verifierMention(solidaire, true)).toEqual({ ok: true, montantEuros: 12_000 })

    // Dire « solidaire » sans renoncer ne suffit pas.
    const moitie = PASSE + ' Caution solidaire.'
    expect(verifierMention(moitie, true)).toEqual({ ok: false, manques: ['solidarite'] })
  })

  test('tout peut manquer a la fois, et chaque manque est nomme', () => {
    expect(verifierMention('Bonjour.', true)).toEqual({
      ok: false,
      manques: ['caution', 'paiement', 'montant', 'solidarite'],
    })
  })
})

describe('ce que la base tient', () => {
  let db: PGlite
  let dossier: string

  async function porteur(role: 'locataire' | 'garant') {
    await db.exec('set role porteur_lien')
    await db.exec(`set request.jwt.claim.sub = ''`)
    await db.exec(`set request.jwt.claim.dossier_id = '${dossier}'`)
    await db.exec(`set request.jwt.claim.role_partie = '${role}'`)
  }

  beforeEach(async () => {
    db = await baseDEssai()
    await devenir(db, 'serveur')
    const { rows } = await db.query<{ ouvrir_dossier: string }>(
      `select public.ouvrir_dossier('locataire@exemple.fr')`,
    )
    await redevenirProprietaire(db)
    const { rows: d } = await db.query<{ id: string }>(
      'select id from public.dossiers where reference = $1',
      [rows[0]!.ouvrir_dossier],
    )
    dossier = d[0]!.id
    await porteur('garant')
    await db.query(`insert into public.engagements (dossier_id) values ('${dossier}')`)
  })

  test('le garant ecrit son identite et sa mention, datee', async () => {
    await porteur('garant')
    await db.query(`
      update public.engagements
         set nom = 'Martin', prenom = 'Camille', adresse = '1 rue de l Exemple, 69003 Lyon',
             mention = '${'x'.repeat(60)}', mention_saisie_le = now()
       where dossier_id = '${dossier}'
    `)
    await redevenirProprietaire(db)
    const { rows } = await db.query<{ nom: string; datee: boolean }>(
      `select nom, mention_saisie_le is not null as datee from public.engagements`,
    )
    expect(rows[0]).toEqual({ nom: 'Martin', datee: true })
  })

  test('une mention sans date, ou une date sans mention, n existe pas', async () => {
    await porteur('garant')
    expect(
      await refus(db, `update public.engagements set mention = '${'x'.repeat(60)}'`),
    ).toContain('mention_et_sa_date')
    expect(await refus(db, `update public.engagements set mention_saisie_le = now()`)).toContain(
      'mention_et_sa_date',
    )
  })

  test('une mention trop courte pour contenir quatre elements est refusee', async () => {
    await porteur('garant')
    expect(
      await refus(
        db,
        `update public.engagements set mention = 'caution', mention_saisie_le = now()`,
      ),
    ).toContain('engagements_mention_check')
  })

  test('le locataire n ecrit ni mention ni identite du garant, mais son nom', async () => {
    await porteur('locataire')
    // La table ne lui rend rien : zero ligne, pas d'erreur.
    await db.query(`update public.engagements set nom = 'Intrus'`)
    await db.query(`update public.dossiers set locataire_nom = 'Dupont' where id = '${dossier}'`)

    await redevenirProprietaire(db)
    const { rows } = await db.query<{ nom: string | null; locataire_nom: string }>(
      `select e.nom, d.locataire_nom from public.engagements e join public.dossiers d on d.id = e.dossier_id`,
    )
    expect(rows[0]).toEqual({ nom: null, locataire_nom: 'Dupont' })
    expect(await compter(db, 'public.engagements')).toBe(1)
  })

  test('l agence ne touche a rien de tout cela', async () => {
    await devenir(db, 'authenticated', '11111111-1111-1111-1111-111111111111')
    expect(await refus(db, `update public.engagements set mention = 'x'`)).toContain(
      'permission denied',
    )
    expect(await refus(db, `update public.dossiers set locataire_nom = 'x'`)).toContain(
      'permission denied',
    )
  })
})
