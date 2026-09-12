import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { demarrer, lire } = vi.hoisted(() => ({ demarrer: vi.fn(), lire: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: demarrer }))
vi.mock('@/lib/coffre/memoire-processus', () => ({ lireMemoireProcessus: lire }))
import { executerProcessus } from '@/lib/coffre/processus-limite'

const plateforme = Object.getOwnPropertyDescriptor(process, 'platform')!
const contenu = Buffer.from('resultat fictif')
function enfant() {
  const e = Object.assign(new EventEmitter(), {
    pid: 123,
    stdout: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
    kill: vi.fn(),
  })
  return e
}
beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'linux' })
  vi.useFakeTimers()
  lire.mockReset().mockResolvedValue(10 * 1024 * 1024)
  demarrer.mockReset()
})
afterEach(() => {
  Object.defineProperty(process, 'platform', plateforme)
  vi.useRealTimers()
})
function commencer(code: number | null, signal: string | null = null, delai = 1000) {
  const e = enfant()
  demarrer.mockReturnValue(e)
  e.kill.mockImplementation(() => {
    queueMicrotask(() => {
      e.stdout.emit('data', contenu)
      e.emit('exit', code, signal)
      e.emit('close', code, signal)
    })
    return code === null
  })
  const resultat = executerProcessus('fixture.mjs', Buffer.from('document fictif'), { delai })
  // Attacher immediatement les deux branches pour eviter un rejet non observe.
  const issue = resultat.then(
    (valeur) => ({ valeur, erreur: null }),
    (erreur: Error) => ({ valeur: null, erreur }),
  )
  return { e, issue }
}
test('une mesure en course avec une sortie normale ne rejette pas le resultat', async () => {
  const { e, issue } = commencer(0)
  await vi.advanceTimersByTimeAsync(0)
  expect(e.stdin.end).toHaveBeenCalledOnce()
  lire.mockRejectedValueOnce(new Error('indisponible'))
  await vi.advanceTimersByTimeAsync(50)
  expect(e.kill).toHaveBeenCalledWith('SIGKILL')
  expect(await issue).toEqual({ valeur: contenu, erreur: null })
})
test.each([
  [null, 'SIGKILL'],
  [1, null],
  [0, 'SIGKILL'],
] as const)('une panne de mesure avec sortie %s / %s reste refusee', async (code, signal) => {
  const { issue } = commencer(code, signal)
  await vi.advanceTimersByTimeAsync(0)
  lire.mockRejectedValueOnce(new Error('indisponible'))
  await vi.advanceTimersByTimeAsync(50)
  expect((await issue).erreur?.message).toBe('Mesure memoire indisponible')
})
test('une panne initiale ne transmet pas le document et reste refusee meme a sortie zero', async () => {
  lire.mockRejectedValueOnce(new Error('indisponible'))
  const { e, issue } = commencer(0)
  await vi.advanceTimersByTimeAsync(0)
  expect(e.stdin.end).not.toHaveBeenCalled()
  expect((await issue).erreur?.message).toBe('Mesure memoire indisponible')
})
test('une disparition initiale sans mesure positive ne transmet aucun document', async () => {
  lire.mockResolvedValueOnce(null)
  const { e, issue } = commencer(0)
  await vi.advanceTimersByTimeAsync(0)
  e.emit('exit', 0, null)
  e.emit('close', 0, null)
  expect(e.stdin.end).not.toHaveBeenCalled()
  expect((await issue).erreur?.message).toBe('Mesure memoire indisponible')
})
test('un depassement memoire reste refuse meme si la sortie est normale', async () => {
  const { issue } = commencer(0)
  await vi.advanceTimersByTimeAsync(0)
  lire.mockResolvedValueOnce(385 * 1024 * 1024)
  await vi.advanceTimersByTimeAsync(50)
  expect((await issue).erreur?.message).toBe('Memoire documentaire excessive')
})
test('une erreur du flux ne disparait pas derriere une panne de mesure et une sortie normale', async () => {
  const { e, issue } = commencer(0)
  await vi.advanceTimersByTimeAsync(0)
  lire.mockImplementationOnce(async () => {
    e.stdin.emit('error', new Error('detail prive'))
    throw new Error('indisponible')
  })
  await vi.advanceTimersByTimeAsync(50)
  expect((await issue).erreur?.message).toBe('Traitement documentaire interrompu')
})
test('un delai depasse reste refuse meme apres une panne de mesure', async () => {
  const { e, issue } = commencer(0, null, 100)
  e.kill.mockImplementationOnce(() => false)
  await vi.advanceTimersByTimeAsync(0)
  lire.mockRejectedValueOnce(new Error('indisponible'))
  await vi.advanceTimersByTimeAsync(100)
  expect((await issue).erreur?.message).toBe('Document trop long a traiter')
})
