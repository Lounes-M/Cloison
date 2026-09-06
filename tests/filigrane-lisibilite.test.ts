import { createCanvas } from '@napi-rs/canvas'
import { expect, test, vi } from 'vitest'
import { poserFiligrane } from '../workers/rasterisation'

for (const identite of [
  'fixture@piece-12345678-0.cloison.immo - 06/09/2026 - Cloison',
  `${'collaborateur'.repeat(16)}@agence-exemple.fr - 06/09/2026 - Cloison`,
]) {
  test(`le filigrane garde l identite lisible sans repetitions superposees (${identite.length})`, () => {
    const ctx = createCanvas(1240, 1755).getContext('2d')
    const traces: { texte: string; x: number; y: number; largeur: number }[] = []
    const original = ctx.fillText.bind(ctx)
    vi.spyOn(ctx, 'fillText').mockImplementation((texte, x, y) => {
      traces.push({ texte, x, y, largeur: ctx.measureText(texte).width })
      original(texte, x, y)
    })
    poserFiligrane(ctx, 1240, 1755, identite)
    expect(traces.length).toBeGreaterThan(3)
    // Sur une meme ligne diagonale, deux empreintes ne doivent pas se toucher.
    for (const a of traces) {
      for (const b of traces) {
        if (a.y === b.y && a.x < b.x) expect(a.x + a.largeur / 2).toBeLessThan(b.x - b.largeur / 2)
      }
    }
    // Une copie complete doit tenir au centre, meme pour une longue adresse.
    const centre = traces.filter((t) => t.x === 0)
    expect(centre.map((t) => t.texte).join('')).toContain(identite)
    expect(centre.some((t) => t.texte.includes('Cloison'))).toBe(true)
    for (const t of centre) expect(t.largeur).toBeLessThanOrEqual(1240 * 0.7)
  })
}
