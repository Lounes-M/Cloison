import { expect, test, vi } from 'vitest'
const { executer } = vi.hoisted(() => ({ executer: vi.fn() }))
vi.mock('@/lib/coffre/processus-limite', () => ({ executerProcessus: executer }))
import { traiterDocument } from '@/lib/coffre/traitement-document'

test('une sortie invalide ne divulgue pas son contenu dans l erreur journalisable', async () => {
  executer.mockResolvedValue(Buffer.from('revenu_12345'))
  await expect(
    traiterDocument(Buffer.from('test'), 'application/pdf', '', 'verifier'),
  ).rejects.not.toThrow('revenu_12345')
})
