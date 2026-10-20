import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
// @ts-expect-error Programme Node autonome.
import { alerterEchec, messageAlerte } from '../scripts/alerter-echec.mjs'
const contexte = {
  GITHUB_WORKFLOW: 'Supervision',
  GITHUB_REPOSITORY: 'Lounes-M/Cloison',
  GITHUB_RUN_ID: '39387948811',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SERVER_URL: 'https://github.com',
}
const configuration = {
  ...contexte,
  ALERTE_RESEND_CLE: 'fixture-cle',
  ALERTE_DESTINATAIRE: 'alerte@example.com',
  ALERTE_EXPEDITEUR: 'Cloison <alertes@cloison.immo>',
}
afterEach(() => vi.unstubAllGlobals())
test('le message ne porte que le workflow et le lien du passage', () => {
  const m = messageAlerte(contexte)
  expect(m.sujet).toBe('[Cloison] Echec du workflow Supervision')
  expect(m.texte).toContain(
    'https://github.com/Lounes-M/Cloison/actions/runs/39387948811/attempts/1',
  )
  expect(m.cle).toBe('alerte-Lounes-M-Cloison-39387948811-1')
})
test('un contexte GitHub douteux ne produit pas de lien', () => {
  for (const c of [
    { ...contexte, GITHUB_SERVER_URL: 'https://intrus.invalid' },
    { ...contexte, GITHUB_RUN_ID: '1/../../x' },
    { ...contexte, GITHUB_REPOSITORY: 'a/b/c' },
    { ...contexte, GITHUB_WORKFLOW: '<script>' },
    {},
  ])
    expect(() => messageAlerte(c)).toThrow()
})
test('une configuration incomplete echoue sans appel au fournisseur', async () => {
  const appel = vi.fn()
  vi.stubGlobal('fetch', appel)
  for (const c of [
    { ...configuration, ALERTE_RESEND_CLE: '' },
    { ...configuration, ALERTE_DESTINATAIRE: 'pas une adresse' },
    { ...configuration, ALERTE_EXPEDITEUR: undefined },
    { ...configuration, GITHUB_SERVER_URL: 'https://intrus.invalid' },
  ])
    await expect(alerterEchec(c)).rejects.toThrow()
  expect(appel).not.toHaveBeenCalled()
})
test("l'envoi est idempotent par passage et un refus reste un echec", async () => {
  const appel = vi.fn(async () => new Response('{"id":"x"}', { status: 200 }))
  vi.stubGlobal('fetch', appel)
  await alerterEchec(configuration)
  expect(appel).toHaveBeenCalledWith(
    'https://api.resend.com/emails',
    expect.objectContaining({
      method: 'POST',
      redirect: 'error',
      headers: expect.objectContaining({
        Authorization: 'Bearer fixture-cle',
        'Idempotency-Key': 'alerte-Lounes-M-Cloison-39387948811-1',
      }),
    }),
  )
  const corps = JSON.parse((appel.mock.calls[0] as unknown as [string, { body: string }])[1].body)
  expect(corps.to).toEqual(['alerte@example.com'])
  appel.mockImplementationOnce(async () => new Response('{}', { status: 403 }))
  await expect(alerterEchec(configuration)).rejects.toThrow('Alerte refusee')
})
test("l'alerte suit l'echec de chaque job de supervision", () => {
  const workflow = readFileSync(resolve('.github/workflows/supervision.yml'), 'utf8')
  const job = workflow.split('\n  alerte:\n')[1]
  expect(job).toContain('needs: [rapport, parcours-publics]')
  expect(job).toContain('if: ${{ failure() }}')
  expect(job).toContain('run: node scripts/alerter-echec.mjs')
  expect(job).not.toContain('CRON_SECRET')
})
