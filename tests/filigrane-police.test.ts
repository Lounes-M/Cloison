import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { afterEach, expect, test, vi } from 'vitest'
import { poserFiligrane } from '../workers/rasterisation'
afterEach(() => {
  vi.restoreAllMocks()
})
test('le filigrane utilise une police embarquee quand le chargement systeme est desactive', () => {
  const script = `
    import { createCanvas, GlobalFonts } from ${JSON.stringify(resolve('node_modules/@napi-rs/canvas/index.js'))}
    import { poserFiligrane } from ${JSON.stringify(resolve('workers/rasterisation.ts'))}
    const ctx=createCanvas(600,360).getContext('2d')
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,600,360)
    const polices=[];const dessiner=ctx.fillText.bind(ctx);ctx.fillText=(...args)=>{polices.push(ctx.font);dessiner(...args)}
    poserFiligrane(ctx,600,360,'fixture@agence.invalid - 06/09/2026 - Cloison')
    const pixels=ctx.getImageData(0,0,600,360).data
    let marques=0
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]<250)marques++
    console.log(JSON.stringify({marques,policeEmbarquee:GlobalFonts.has('CloisonFiligrane'),polices}))
  `
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, DISABLE_SYSTEM_FONTS_LOAD: '1' },
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(r.status).toBe(0)
  const preuve = JSON.parse(r.stdout)
  expect(preuve.marques).toBeGreaterThan(500)
  expect(preuve.policeEmbarquee).toBe(true)
  expect(preuve.polices.length).toBeGreaterThan(0)
  expect(preuve.polices.every((p: string) => p.includes('CloisonFiligrane'))).toBe(true)
})
test('une police embarquee illisible interdit une restitution silencieuse sans filigrane', () => {
  GlobalFonts.removeAll()
  vi.spyOn(GlobalFonts, 'registerFromPath').mockReturnValue(null)
  const ctx = createCanvas(600, 360).getContext('2d')
  expect(() => poserFiligrane(ctx, 600, 360, 'fixture@agence.invalid')).toThrow(
    'Police du filigrane indisponible',
  )
})
