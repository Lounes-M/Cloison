import { afterEach, expect, test, vi } from 'vitest'
import { configurationOcr, extraireTexte } from '@/lib/ocr/openrouter'
const configuration = { cle: 'cle-fictive', modele: 'google/gemini-2.5-flash' }
const pdf = Buffer.from('%PDF-1.7 document fictif')
const sortie = (
  content = JSON.stringify({ pages: [{ page: 1, texte: 'Texte fictif' }] }),
  finish_reason = 'stop',
) =>
  new Response(
    JSON.stringify({
      model: configuration.modele,
      choices: [{ finish_reason, message: { content } }],
    }),
  )
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
test('reste desactive sans activation explicite ou cle', () => {
  vi.stubEnv('OCR_ACTIVE', 'false')
  vi.stubEnv('OPENROUTER_API_KEY', 'cle-fictive')
  expect(configurationOcr()).toBeNull()
  vi.stubEnv('OCR_ACTIVE', 'true')
  vi.stubEnv('OPENROUTER_API_KEY', '')
  expect(configurationOcr()).toBeNull()
  vi.stubEnv('OPENROUTER_API_KEY', 'cle-fictive')
  expect(configurationOcr()?.modele).toBe(configuration.modele)
  vi.stubEnv('OPENROUTER_OCR_MODEL', 'https://tiers.invalid')
  expect(configurationOcr()).toBeNull()
})
test('impose destination, confidentialite, moteur natif et sortie avec provenance', async () => {
  const appel = vi.fn().mockResolvedValue(sortie())
  vi.stubGlobal('fetch', appel)
  const resultat = await extraireTexte(pdf, configuration)
  expect(resultat.pages).toEqual([{ page: 1, texte: 'Texte fictif' }])
  expect(resultat.empreinte).toMatch(/^[a-f0-9]{64}$/)
  expect(resultat.modele).toBe(configuration.modele)
  expect(Number.isFinite(Date.parse(resultat.observeLe))).toBe(true)
  expect(appel).toHaveBeenCalledTimes(1)
  const [url, options] = appel.mock.calls[0]!
  expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
  expect(options).toMatchObject({ redirect: 'error', cache: 'no-store', method: 'POST' })
  const corps = JSON.parse(options.body)
  expect(corps.provider).toEqual({
    zdr: true,
    data_collection: 'deny',
    require_parameters: true,
    allow_fallbacks: false,
  })
  expect(corps.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'native' } }])
  expect(corps.max_tokens).toBe(8192)
  expect(corps.tools).toBeUndefined()
  expect(corps.messages[1].content[0].file).toEqual({
    filename: 'piece.pdf',
    file_data: `data:application/pdf;base64,${pdf.toString('base64')}`,
  })
})
test.each([
  Buffer.from('pas un PDF'),
  Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(4 * 1024 * 1024)]),
])('ne transmet pas une entree invalide', async (entree) => {
  const appel = vi.fn()
  vi.stubGlobal('fetch', appel)
  await expect(extraireTexte(entree, configuration)).rejects.toThrow(
    'Lecture documentaire indisponible',
  )
  expect(appel).not.toHaveBeenCalled()
})
test.each([
  sortie('contenu confidentiel invalide'),
  sortie(undefined, 'length'),
  sortie(JSON.stringify({ pages: [{ page: 2, texte: 'texte' }] })),
  sortie(JSON.stringify({ pages: [{ page: 1, texte: 'a'.repeat(24001) }] })),
  sortie(
    JSON.stringify({
      pages: [
        { page: 1, texte: 'a'.repeat(13000) },
        { page: 2, texte: 'a'.repeat(13000) },
      ],
    }),
  ),
  sortie(JSON.stringify({ pages: [], score: 100 })),
  new Response('detail prive', { status: 429 }),
  new Response('x'.repeat(131073)),
  new Response('{}', { headers: { 'content-length': '131073' } }),
  new Response(
    JSON.stringify({
      model: 'autre/modele',
      choices: [
        { finish_reason: 'stop', message: { content: '{"pages":[{"page":1,"texte":"x"}]}' } },
      ],
    }),
  ),
])('refuse sans divulguer une reponse fournisseur invalide (%#)', async (reponse) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse))
  await expect(extraireTexte(pdf, configuration)).rejects.toThrow(
    /^Lecture documentaire indisponible$/,
  )
})
test('une annulation interrompt un flux qui ne finit pas', async () => {
  const controleur = new AbortController(),
    annulation = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel: annulation }))),
  )
  const promesse = extraireTexte(pdf, configuration, controleur.signal)
  await new Promise((r) => setTimeout(r, 5))
  controleur.abort()
  await expect(promesse).rejects.toThrow('Lecture documentaire indisponible')
  expect(annulation).toHaveBeenCalled()
})
