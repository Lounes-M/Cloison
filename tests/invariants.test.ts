import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Les regles qui ne se negocient pas, sous forme de tests.
 *
 * La feuille de route en liste sept et dit : chacune devrait exister sous forme
 * de test, pas seulement de paragraphe. Quatre vivent deja dans les tests SQL :
 * le locataire ne voit ni piece ni montant (`dossiers`, `ratio`), toute lecture
 * verifie le role cote serveur (chaque fichier de politiques), une piece a
 * echeance est detruite (`purge`), tout acces laisse une trace (`journal`).
 *
 * Les trois autres ne sont pas des politiques mais des proprietes du code
 * lui-meme : ce qui est importe ou. On les tient en lisant les sources. C'est
 * grossier, et c'est voulu : un import est la seule facon pour un chemin de
 * paiement d'atteindre un ecran, et un scan le voit avant qu'un humain le lise.
 */

const racine = join(import.meta.dirname, '..')

function fichiers(dossier: string): string[] {
  const chemin = join(racine, dossier)
  try {
    if (!statSync(chemin).isDirectory()) return []
  } catch {
    return []
  }
  return readdirSync(chemin, { withFileTypes: true }).flatMap((entree) => {
    const complet = join(dossier, entree.name)
    if (entree.isDirectory()) return fichiers(complet)
    return /\.(ts|tsx)$/.test(entree.name) ? [complet] : []
  })
}

function imports(fichier: string): string[] {
  const source = readFileSync(join(racine, fichier), 'utf8')
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)
}

/** Tout ce qui s'execute pour le garant : sa page, ses actions, ses formulaires, le coffre. */
const COTE_GARANT = [
  ...fichiers('app/(porteur)/garant'),
  ...fichiers('lib/garant'),
  ...fichiers('lib/coffre'),
  'components/forms/FormulaireDepot.tsx',
  'components/forms/FormulaireEngagement.tsx',
  'components/forms/FormulaireMention.tsx',
  'components/forms/BoutonRetrait.tsx',
].map((f) => relative(racine, join(racine, f)).replace(/\\/g, '/'))

const TOUT_LE_CODE = [...fichiers('app'), ...fichiers('lib'), ...fichiers('components')].map((f) =>
  f.replace(/\\/g, '/'),
)

describe('le garant ne paie jamais', () => {
  test('aucun module de paiement n est atteignable depuis ce qui s execute pour lui', () => {
    // La regle d'or de la page d'accueil : « sinon ca ne part pas ». Le jour ou
    // `lib/paiement` existe, ce test est ce qui l'empeche d'arriver ici.
    for (const fichier of COTE_GARANT) {
      const coupables = imports(fichier).filter((i) => /paiement|stripe/i.test(i))
      expect(coupables, `${fichier} importe ${coupables.join(', ')}`).toEqual([])
    }
  })

  test('un module de paiement, s il existe, vit dans lib/paiement et nulle part ailleurs', () => {
    for (const fichier of TOUT_LE_CODE) {
      if (fichier.startsWith('lib/paiement/')) continue
      const direct = imports(fichier).filter((i) => i === 'stripe' || i.startsWith('stripe/'))
      expect(direct, `${fichier} importe Stripe directement`).toEqual([])
    }
  })
})

describe('le garant ne voit jamais ses pieces degradees', () => {
  test('la rasterisation et l ouverture filigranee ne s importent pas cote garant', () => {
    // Le filigrane s'applique a la sortie vers l'agence, jamais au depot
    // (ADR 0004). Le nom `ouvrirPiecePourLAgence` porte la restriction ; ce
    // test la tient.
    // Trois fichiers du coffre appartiennent a l'agence, pas au garant : ce sont
    // eux que le scan protege, pas eux qu'il surveille.
    const COTE_AGENCE = new Set([
      'lib/coffre/ouverture.ts',
      'lib/coffre/rasterisation.ts',
      'lib/coffre/ouverture-supabase.ts',
    ])
    for (const fichier of COTE_GARANT) {
      if (COTE_AGENCE.has(fichier)) continue
      const coupables = imports(fichier).filter((i) => /ouverture|rasterisation/.test(i))
      expect(coupables, `${fichier} importe ${coupables.join(', ')}`).toEqual([])
    }
  })

  test('la rasterisation n est appelee que par l ouverture pour l agence', () => {
    for (const fichier of TOUT_LE_CODE) {
      if (fichier === 'lib/coffre/ouverture.ts') continue
      expect(
        imports(fichier).some((i) => /rasterisation/.test(i)),
        `${fichier} importe la rasterisation`,
      ).toBe(false)
    }
  })
})

describe('la mention n est jamais pre-remplie ni suggeree', () => {
  const PHRASE_A_LA_PREMIERE_PERSONNE =
    /\bje (me porte|m[’']engage|paierai|paie|renonce|reconnais)\b/i

  test('ni le contenu ni le formulaire ne contiennent une phrase de mention', () => {
    // Guider sans fournir (ADR 0005). Une phrase a la premiere personne dans
    // ces fichiers finirait a l'ecran, et l'engagement tomberait.
    for (const fichier of ['lib/content/garant.ts', 'components/forms/FormulaireMention.tsx']) {
      const source = readFileSync(join(racine, fichier), 'utf8')
      expect(PHRASE_A_LA_PREMIERE_PERSONNE.test(source), `${fichier} suggere une mention`).toBe(
        false,
      )
    }
  })

  test('la zone de saisie n a ni exemple ni texte par defaut', () => {
    const source = readFileSync(join(racine, 'components/forms/FormulaireMention.tsx'), 'utf8')
    const zone = source.slice(
      source.indexOf('<textarea'),
      source.indexOf('/>', source.indexOf('<textarea')),
    )
    expect(zone).not.toMatch(/placeholder=/)
    // Ce qui est reaffiche est ce que la personne a ecrit, jamais autre chose.
    expect(zone).toMatch(/defaultValue=\{valeurs\.mention \?\? actuel\?\.mention \?\? ''\}/)
  })
})
