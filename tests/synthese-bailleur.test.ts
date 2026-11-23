import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test, vi } from 'vitest'

import { natures as naturesEn } from '@/lib/content/en/espace'
import { synthese as en } from '@/lib/content/en/synthese'
import { natures } from '@/lib/content/espace'
import { synthese as fr } from '@/lib/content/synthese'
import { synthesePourLeBailleur } from '@/lib/dossiers/synthese-agence'
import {
  dessinerSynthese,
  donneesSynthese,
  etatActe,
  naturesExaminees,
  type DonneesSynthese,
} from '@/lib/dossiers/synthese-bailleur'

/**
 * La page remise au bailleur.
 *
 * Trois promesses a tenir : elle ne porte aucun montant de revenu, elle tient
 * toujours sur une page, et ce qui part vers l'agence est une photographie
 * filigranee, jamais le PDF dessine.
 */

const REVENU = '3 200'

function brut(): Record<string, unknown> {
  return {
    reference: 'CLS-7H2K-9QXM',
    statut: 'transmis',
    demonstration: false,
    locataire: 'Camille Durand',
    loyer_cents: 100000,
    logement: 'T2, 14 rue des Lilas, 69003 Lyon',
    agence: 'Agence des Lilas',
    seuil: 3,
    engagement: {
      garant: 'Dominique Durand',
      couvre: 'loyer_charges',
      plafond_cents: 3600000,
      jusqu_au: '2029-11-30',
      solidaire: true,
      mention_le: '2026-11-20T10:00:00+00:00',
      ratio: 3.2,
      calcule_le: '2026-11-19T09:00:00+00:00',
    },
    groupe: null,
    pieces: [
      {
        type: 'bulletin_paie',
        documents: 3,
        depose_le: '2026-11-18T09:00:00+00:00',
        examen: 'examine',
        examine_le: '2026-11-21T09:00:00+00:00',
      },
      {
        type: 'avis_imposition',
        documents: 1,
        depose_le: '2026-11-18T09:05:00+00:00',
        examen: null,
        examine_le: null,
      },
    ],
    acte: null,
  }
}
const donnees = (): DonneesSynthese => donneesSynthese.parse(brut())
const LE = new Date('2026-11-23T14:00:00Z')

async function texteDe(pdf: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const chargement = pdfjs.getDocument({ data: new Uint8Array(pdf) })
  const document = await chargement.promise
  const page = await document.getPage(1)
  const contenu = await page.getTextContent()
  const texte = contenu.items.map((item) => ('str' in item ? item.str : '')).join(' ')
  const pages = document.numPages
  await chargement.destroy()
  return { texte: texte.replace(/\s+/g, ' '), pages }
}
const dessiner = (d: DonneesSynthese, langue: 'fr' | 'en' = 'fr') =>
  dessinerSynthese(d, {
    langue,
    textes: (langue === 'en' ? en : fr).pdf,
    natures: langue === 'en' ? naturesEn : natures,
    le: LE,
  })

describe('ce que la page sait lire', () => {
  test('un revenu glisse dans les donnees fait echouer la lecture', () => {
    expect(donneesSynthese.safeParse({ ...brut(), revenu_net_mensuel_cents: 320000 }).success).toBe(
      false,
    )
    const e = brut().engagement as Record<string, unknown>
    expect(
      donneesSynthese.safeParse({ ...brut(), engagement: { ...e, revenu: 320000 } }).success,
    ).toBe(false)
  })

  test('un statut ou une decision ne se prend pas est refuse', () => {
    for (const statut of ['ouvert', 'depot_en_cours', 'refuse', 'expire'])
      expect(donneesSynthese.safeParse({ ...brut(), statut }).success).toBe(false)
  })
})

describe('les pieces, par nature', () => {
  const p = (type: string, examen: 'examine' | 'a_revoir' | 'a_examiner' | null, le?: string) => ({
    type,
    documents: 1,
    depose_le: '2026-11-18T09:00:00+00:00',
    examen,
    examine_le: le ?? null,
  })

  test('une nature n est examinee que si toutes ses pieces le sont', () => {
    expect(
      naturesExaminees([
        p('bulletin_paie', 'examine', '2026-11-20T09:00:00+00:00'),
        p('bulletin_paie', null),
        p('avis_imposition', 'examine', '2026-11-20T09:00:00+00:00'),
        p('avis_imposition', 'examine', '2026-11-22T09:00:00+00:00'),
      ]),
    ).toEqual([
      { type: 'bulletin_paie', documents: 2, etat: 'a_examiner', examineLe: null },
      {
        type: 'avis_imposition',
        documents: 2,
        etat: 'examine',
        examineLe: '2026-11-22T09:00:00+00:00',
      },
    ])
  })

  test('une seule piece a revoir l emporte', () => {
    expect(
      naturesExaminees([
        p('bulletin_paie', 'examine', '2026-11-20T09:00:00+00:00'),
        p('bulletin_paie', 'a_revoir'),
      ])[0],
    ).toMatchObject({ etat: 'a_revoir', examineLe: null })
  })
})

describe('l etat de l acte', () => {
  test.each([
    [null, 'transmis', 'aucun'],
    [null, 'signe', 'signe'],
    ['preparation', 'transmis', 'preparation'],
    ['a_valider', 'transmis', 'preparation'],
    ['activation', 'transmis', 'preparation'],
    ['en_cours', 'transmis', 'en_cours'],
    ['incertain', 'transmis', 'incertain'],
    ['archive', 'transmis', 'archive'],
    ['archive', 'signe', 'archive'],
  ] as const)('acte %s, dossier %s : %s', (acte, statut, attendu) => {
    expect(etatActe({ acte, statut })).toBe(attendu)
  })
})

describe('la page dessinee', () => {
  test('elle dit le ratio, le seuil, les pieces et l acte, sur une page', async () => {
    const { texte, pages } = await texteDe(await dessiner(donnees()))
    expect(pages).toBe(1)
    for (const attendu of [
      'Synthèse du dossier de caution',
      'CLS-7H2K-9QXM',
      'Agence des Lilas',
      '23 novembre 2026',
      'Camille Durand',
      'Dominique Durand',
      '3,20 fois le loyer',
      'Seuil atteint',
      '3,00 fois le loyer',
      'Cautionnement solidaire',
      'Jusqu’au 30 novembre 2029',
      'Bulletin de paie',
      '3 documents',
      'Examiné le 21 novembre 2026',
      'Avis d’imposition',
      'Non examiné',
      '1 nature de pièces sur 2',
      'Pas encore préparé dans Cloison',
      'aucun justificatif',
    ])
      expect(texte, attendu).toContain(attendu)
  })

  test('elle ne porte ni revenu, ni adresse, ni courriel', async () => {
    const { texte } = await texteDe(await dessiner(donnees()))
    expect(texte).not.toContain(REVENU)
    expect(texte).not.toContain('3200')
    expect(texte).not.toContain('@')
    // Le seul endroit ou le mot apparait dit que le montant n'est pas communique.
    expect(texte.match(/revenu/gi)).toHaveLength(2)
    expect(texte).toContain('Le montant de ce revenu n’est pas communiqué')
  })

  test('sous le seuil, elle le dit', async () => {
    const d = donnees()
    d.engagement!.ratio = 2.4
    d.statut = 'garant_insuffisant'
    const { texte } = await texteDe(await dessiner(d))
    expect(texte).toContain('Seuil non atteint')
    expect(texte).toContain('solvabilité inférieure au seuil')
  })

  test('un dossier de demonstration est marque comme tel', async () => {
    const d = donnees()
    d.demonstration = true
    expect((await texteDe(await dessiner(d))).texte).toContain('Dossier de démonstration')
    expect((await texteDe(await dessiner(donnees()))).texte).not.toContain('démonstration')
  })

  test('le dossier le plus charge tient encore sur une page, dans les deux langues', async () => {
    const d = donnees()
    d.demonstration = true
    d.locataire = 'Camille Durand de la Tour du Pin Montauban '.repeat(5).trim()
    d.logement = 'Appartement T4, bâtiment C, résidence des Lilas, 69003 Lyon '.repeat(2).trim()
    d.groupe = { reference: 'CLS-AAAA-BBBB', ratio: 4.1 }
    d.pieces = Object.keys(natures).flatMap((type) =>
      Array.from({ length: 40 }, () => ({
        type,
        documents: 1,
        depose_le: '2026-11-18T09:00:00+00:00',
        examen: 'examine' as const,
        examine_le: '2026-11-21T09:00:00+00:00',
      })),
    )
    d.acte = 'archive'
    for (const langue of ['fr', 'en'] as const) {
      const { texte, pages } = await texteDe(await dessiner(d, langue))
      expect(pages).toBe(1)
      expect(texte).toContain(langue === 'fr' ? '40 documents' : 'Signed electronically')
    }
  })

  test('en anglais, la page est en anglais', async () => {
    const { texte } = await texteDe(await dessiner(donnees(), 'en'))
    expect(texte).toContain('Guarantee file summary')
    expect(texte).toContain('3.20 times the rent')
    expect(texte).toContain('Threshold met')
    expect(texte).toContain('23 November 2026')
  })
})

describe('ce que l agence recoit', () => {
  const base = (data: unknown, error: unknown = null) => {
    const rpc = vi.fn().mockResolvedValue({ data, error })
    return { supabase: { rpc } as unknown as SupabaseClient, rpc }
  }

  test('un refus de la base ne produit rien', async () => {
    const { supabase, rpc } = base(null)
    const dossier = '11111111-1111-4111-8111-111111111111'
    expect(await synthesePourLeBailleur(supabase, dossier, 'a@agence.invalid', 'fr')).toEqual({
      ok: false,
      motif: 'refus',
    })
    expect(rpc).toHaveBeenCalledWith('preparer_synthese_bailleur', { le_dossier: dossier })
    expect(
      await synthesePourLeBailleur(base(null, { message: 'x' }).supabase, dossier, 'a@b.c', 'fr'),
    ).toEqual({ ok: false, motif: 'refus' })
  })

  test('des donnees inattendues ne sont pas imprimees', async () => {
    const { supabase } = base({ ...brut(), revenu_net_mensuel_cents: 320000 })
    expect(await synthesePourLeBailleur(supabase, 'x', 'a@agence.invalid', 'fr')).toEqual({
      ok: false,
      motif: 'indisponible',
    })
  })

  test('la page part rasterisee : plus aucun texte a copier, une seule page', async () => {
    const { supabase } = base(brut())
    const s = await synthesePourLeBailleur(supabase, 'x', 'prenom.nom@agence.invalid', 'fr', LE)
    if (!s.ok) throw new Error(s.motif)
    expect(s.reference).toBe('CLS-7H2K-9QXM')
    expect(s.pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const { texte, pages } = await texteDe(s.pdf)
    expect(pages).toBe(1)
    expect(texte.trim()).toBe('')
  }, 60_000)
})
