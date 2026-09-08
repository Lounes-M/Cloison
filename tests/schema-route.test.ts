import { afterEach, expect, test, vi } from 'vitest'
import reference from '@/lib/exploitation/schema-production.json'
import { schemaConforme } from '@/lib/exploitation/schema'
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  client: vi.fn(),
  schema: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
}))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: h.client }))
import { GET } from '@/app/api/schema/route'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  h.rpc.mockReset()
  h.client.mockReset()
  h.schema.mockReset()
  h.from.mockReset()
  h.select.mockReset()
  h.limit.mockReset()
})
function config() {
  vi.stubEnv('CRON_SECRET', 'fixture-secret')
  h.client.mockResolvedValue({ rpc: h.rpc, schema: h.schema })
  h.schema.mockReturnValue({ from: h.from })
  h.from.mockReturnValue({ select: h.select })
  h.select.mockReturnValue({ limit: h.limit })
  h.limit.mockResolvedValue({ data: null, error: { code: 'PGRST106' } })
  h.rpc.mockResolvedValue({ data: reference, error: null })
}
for (const bearer of [undefined, 'Bearer mauvais', 'bearer fixture-secret']) {
  test('sans authentification exacte aucune requete SQL ne part', async () => {
    config()
    const r = await GET(
      new Request('https://cloison.invalid/api/schema', {
        headers: bearer ? { authorization: bearer } : {},
      }),
    )
    expect(r.status).toBe(401)
    expect(h.client).not.toHaveBeenCalled()
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
}
test('une configuration absente ne devient pas une autorisation', async () => {
  config()
  vi.stubEnv('CRON_SECRET', '')
  const r = await GET(
    new Request('https://cloison.invalid/api/schema', { headers: { authorization: 'Bearer ' } }),
  )
  expect(r.status).toBe(401)
  expect(h.client).not.toHaveBeenCalled()
})
test('un catalogue exact rend seulement le resultat sans empreintes ni cache', async () => {
  config()
  const r = await GET(
    new Request('https://cloison.invalid/api/schema', {
      headers: { authorization: 'Bearer fixture-secret' },
    }),
  )
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ conforme: true })
  expect(r.headers.get('cache-control')).toBe('no-store')
  expect(h.rpc).toHaveBeenCalledExactlyOnceWith('empreinte_schema')
  expect(h.schema).toHaveBeenCalledExactlyOnceWith('net')
  expect(h.from).toHaveBeenCalledExactlyOnceWith('http_request_queue')
  expect(h.select).toHaveBeenCalledExactlyOnceWith('id')
  expect(h.limit).toHaveBeenCalledExactlyOnceWith(0)
})

test.each([null, { code: '42501' }, { code: 'PGRST205' }])(
  'un schema reseau expose ou un refus ambigu %j bloque le controle',
  async (error) => {
    config()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.limit.mockResolvedValue({ data: null, error })
    const r = await GET(
      new Request('https://cloison.invalid/api/schema', {
        headers: { authorization: 'Bearer fixture-secret' },
      }),
    )
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ conforme: false })
  },
)
for (const cas of ['derive', 'erreur', 'exception', 'champ-prive']) {
  test(`le cas ${cas} reste un echec sans journal detaille`, async () => {
    config()
    const prive = 'prive@audit.invalid'
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    if (cas === 'exception') h.client.mockRejectedValue(new Error(prive))
    if (cas === 'erreur') h.rpc.mockResolvedValue({ data: reference, error: { message: prive } })
    if (cas === 'derive')
      h.rpc.mockResolvedValue({
        data: { ...reference, empreintes: { ...reference.empreintes, tables: '0'.repeat(64) } },
        error: null,
      })
    if (cas === 'champ-prive')
      h.rpc.mockResolvedValue({ data: { ...reference, email: prive }, error: null })
    const r = await GET(
      new Request('https://cloison.invalid/api/schema', {
        headers: { authorization: 'Bearer fixture-secret' },
      }),
    )
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ conforme: false })
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(log).toHaveBeenCalledExactlyOnceWith('[schema] controle indisponible ou derive detectee')
  })
}
test('les empreintes incompletes ou malformees et references invalides ne sont jamais conformes', () => {
  for (const r of [
    null,
    [],
    {},
    { ...reference, version: 2 },
    { ...reference, empreintes: {} },
    { ...reference, empreintes: { ...reference.empreintes, tables: '0'.repeat(63) } },
    { ...reference, empreintes: { ...reference.empreintes, tables: 42 } },
    { ...reference, empreintes: { ...reference.empreintes, tables: 'z'.repeat(64) } },
  ]) {
    expect(schemaConforme(r, reference)).toBe(false)
    expect(schemaConforme(reference, r)).toBe(false)
    expect(schemaConforme(r, r)).toBe(false)
  }
})
