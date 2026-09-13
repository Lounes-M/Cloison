import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const { demarrer } = vi.hoisted(() => ({ demarrer: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: demarrer }))
import { commandeDocker } from '../scripts/commande-docker-documentaire.mjs'

beforeEach(() => {
  vi.useFakeTimers()
  demarrer.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})
function commencer(maximum = 10, delai = 100) {
  const e = Object.assign(new EventEmitter(), {
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
    stdout: new EventEmitter(),
    kill: vi.fn(),
  })
  demarrer.mockReturnValue(e)
  const issue = commandeDocker(['start', 'nom'], Buffer.from('fictif'), maximum, delai).then(
    (valeur) => ({ valeur, erreur: null }),
    (erreur: Error) => ({ valeur: null, erreur }),
  )
  return { e, issue }
}

test('transporte exclusivement par stdin avec un daemon local et sans secrets herites', async () => {
  vi.stubEnv('SECRET_FICTIF', 'confidentiel')
  vi.stubEnv('DOCKER_HOST', 'tcp://ailleurs.invalid:2375')
  vi.stubEnv('NODE_OPTIONS', '--expose-gc')
  const { e, issue } = commencer()
  const [executable, args, options] = demarrer.mock.calls[0]!
  expect(executable).toBe('docker')
  expect(args.slice(0, 2)).toEqual(['--host', expect.stringMatching(/^unix:\/\//)])
  expect(options.env).not.toHaveProperty('SECRET_FICTIF')
  expect(options.env).not.toHaveProperty('DOCKER_HOST')
  expect(options.env).not.toHaveProperty('NODE_OPTIONS')
  expect(options.stdio).toEqual(['pipe', 'pipe', 'ignore'])
  expect(e.stdin.end).toHaveBeenCalledWith(Buffer.from('fictif'))
  e.stdout.emit('data', Buffer.from('0123456789'))
  e.emit('close', 0, null)
  expect((await issue).valeur).toEqual(Buffer.from('0123456789'))
  await vi.advanceTimersByTimeAsync(1000)
  expect(e.kill).not.toHaveBeenCalled()
})

test('refuse la sortie excessive meme suivie de code zero', async () => {
  const { e, issue } = commencer()
  e.stdout.emit('data', Buffer.from('012345'))
  e.stdout.emit('data', Buffer.from('67890'))
  expect(e.kill).toHaveBeenCalledWith('SIGKILL')
  e.emit('close', 0, null)
  expect((await issue).erreur?.message).toBe('Commande documentaire refusee')
})
test('interrompt au delai et attend la fermeture avant de terminer', async () => {
  const { e, issue } = commencer()
  let termine = false
  void issue.then(() => {
    termine = true
  })
  await vi.advanceTimersByTimeAsync(100)
  expect(e.kill).toHaveBeenCalledWith('SIGKILL')
  expect(termine).toBe(false)
  e.emit('close', 0, null)
  expect((await issue).erreur?.message).toBe('Commande documentaire refusee')
})
for (const cible of ['processus', 'entree', 'sortie'])
  test(`refuse une erreur ${cible} sans exposer son contenu`, async () => {
    const { e, issue } = commencer()
    ;(cible === 'processus' ? e : cible === 'entree' ? e.stdin : e.stdout).emit(
      'error',
      new Error('secret fictif'),
    )
    e.emit('close', 0, null)
    expect((await issue).erreur?.message).toBe('Commande documentaire refusee')
  })
for (const [code, signal] of [
  [1, null],
  [null, 'SIGKILL'],
  [0, 'SIGTERM'],
] as const)
  test(`refuse la sortie ${code}/${signal}`, async () => {
    const { e, issue } = commencer()
    e.emit('close', code, signal)
    expect((await issue).erreur?.message).toBe('Commande documentaire refusee')
  })
