import { expect, test } from 'vitest'
import { chiffrerBrouillon, dechiffrerBrouillon } from '@/lib/brouillons/format'
const cle = Buffer.alloc(32, 1)
const saisie = {
  profil: 'salarie' as const,
  couvre: 'loyer' as const,
  montant: '1200',
  revenu: '',
  jusquAu: '',
  solidaire: false,
}
test('une saisie incomplete est chiffree et retrouvee exactement', () => {
  const a = chiffrerBrouillon(saisie, 'dossier', 1, cle),
    b = chiffrerBrouillon(saisie, 'dossier', 1, cle)
  expect(a).not.toEqual(b)
  expect(a.toString()).not.toContain('salarie')
  expect(dechiffrerBrouillon(a, 'dossier', 1, cle)).toEqual(saisie)
})
test.each(['autre-dossier', 'autre-version', 'cle', 'altere', 'tronque', 'excessif'])(
  'refuse %s',
  (cas) => {
    const c = chiffrerBrouillon(saisie, 'dossier', 1, cle)
    if (cas === 'altere') c[c.length - 1]! ^= 1
    expect(() =>
      dechiffrerBrouillon(
        cas === 'tronque' ? c.subarray(0, 20) : cas === 'excessif' ? Buffer.alloc(4097) : c,
        cas === 'autre-dossier' ? 'autre' : 'dossier',
        cas === 'autre-version' ? 2 : 1,
        cas === 'cle' ? Buffer.alloc(32, 2) : cle,
      ),
    ).toThrow()
  },
)
test('aucune mention, piece ou donnee supplementaire dans le format', () => {
  expect(() =>
    chiffrerBrouillon({ ...saisie, mention: 'prive' } as typeof saisie, 'dossier', 1, cle),
  ).toThrow()
  expect(() =>
    chiffrerBrouillon({ ...saisie, revenu: 'x'.repeat(33) }, 'dossier', 1, cle),
  ).toThrow()
})

test.each(['2026-02-30', 'pasdate', '2026-13-01'])(
  'une date impossible ne sera pas silencieusement perdue a la reprise : %s',
  (jusquAu) => {
    expect(() => chiffrerBrouillon({ ...saisie, jusquAu }, 'dossier', 1, cle)).toThrow()
  },
)
